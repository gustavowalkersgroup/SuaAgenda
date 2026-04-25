/**
 * Flow Engine — Automação visual baseada em JSON
 *
 * Nodes disponíveis:
 *  message   → envia texto fixo
 *  input     → aguarda resposta do cliente e salva em variável
 *  condition → if/else baseado em variável ou status
 *  action    → executa ação: set_status, assign_agent, add_tag, remove_tag
 *  ai        → delega para o agente de IA
 *  delay     → aguarda X segundos antes de continuar
 *  typing    → simula "digitando..." por X ms
 *  follow_up → agenda uma mensagem futura
 */

import { query } from '../db/client'
import { sendMessage } from '../modules/whatsapp/whatsapp.service'
import { updateContact, attachTags } from '../modules/contacts/contacts.service'
import { assignConversation } from '../modules/conversations/conversations.service'
import { logger } from '../config/logger'
import { redis } from '../db/redis'

// ==========================================================================
// Tipos de nodes
// ==========================================================================

export type NodeType =
  | 'message'
  | 'input'
  | 'condition'
  | 'action'
  | 'ai'
  | 'delay'
  | 'typing'
  | 'follow_up'

export interface FlowNode {
  id: string
  type: NodeType
  data: Record<string, unknown>
  next?: string           // ID do próximo node
  nextTrue?: string       // condition: branch verdadeiro
  nextFalse?: string      // condition: branch falso
}

export interface Flow {
  id: string
  workspaceId: string
  name: string
  trigger: string
  nodes: FlowNode[]
  isActive: boolean
}

export interface FlowContext {
  workspaceId: string
  conversationId: string
  contactId: string
  variables: Record<string, string>
  lastMessage: string
}

const FLOW_STATE_TTL = 60 * 60 * 24  // 24h

// ==========================================================================
// Execução
// ==========================================================================

export async function executeFlow(flowId: string, ctx: FlowContext): Promise<void> {
  const flow = await getFlow(ctx.workspaceId, flowId)
  if (!flow || !flow.isActive) return

  const stateKey = `flow:state:${ctx.conversationId}:${flowId}`
  const savedState = await redis.get(stateKey)
  const startNodeId = savedState || flow.nodes[0]?.id

  if (!startNodeId) return

  await runFromNode(flow, startNodeId, ctx, stateKey)
}

async function runFromNode(
  flow: Flow,
  nodeId: string,
  ctx: FlowContext,
  stateKey: string
): Promise<void> {
  const node = flow.nodes.find((n) => n.id === nodeId)
  if (!node) return

  logger.debug('Flow node executing', { flowId: flow.id, nodeId, type: node.type })

  try {
    const result = await executeNode(node, ctx)

    if (result.waitForInput) {
      // Pausa fluxo aguardando resposta do cliente
      await redis.set(stateKey, nodeId, { EX: FLOW_STATE_TTL })
      return
    }

    if (result.nextNodeId) {
      await runFromNode(flow, result.nextNodeId, ctx, stateKey)
    } else {
      // Fluxo concluído
      await redis.del(stateKey)
    }
  } catch (err) {
    logger.error('Flow node error', { nodeId, error: (err as Error).message })
    await redis.del(stateKey)
  }
}

interface NodeResult {
  waitForInput?: boolean
  nextNodeId?: string
}

async function executeNode(node: FlowNode, ctx: FlowContext): Promise<NodeResult> {
  switch (node.type) {
    case 'message': {
      const text = interpolateVars(node.data.text as string, ctx.variables)
      await sendMessage(ctx.workspaceId, ctx.conversationId, text)
      return { nextNodeId: node.next }
    }

    case 'typing': {
      const ms = Number(node.data.durationMs) || 1500
      await new Promise((r) => setTimeout(r, ms))
      return { nextNodeId: node.next }
    }

    case 'delay': {
      const seconds = Number(node.data.seconds) || 30
      // Para delays longos, agenda re-execução em vez de bloquear
      if (seconds > 10) {
        const resumeAt = Date.now() + seconds * 1000
        await redis.set(
          `flow:delay:${ctx.conversationId}:${node.id}`,
          JSON.stringify({ ...ctx, nodeId: node.next }),
          { PXAT: resumeAt + 5000 }
        )
        return { waitForInput: true }
      }
      await new Promise((r) => setTimeout(r, seconds * 1000))
      return { nextNodeId: node.next }
    }

    case 'input': {
      const { variableName, question } = node.data as { variableName: string; question?: string }

      if (ctx.lastMessage) {
        // Chegou uma mensagem — salva como variável e continua
        ctx.variables[variableName] = ctx.lastMessage
        return { nextNodeId: node.next }
      }

      // Envia pergunta e aguarda
      if (question) {
        await sendMessage(ctx.workspaceId, ctx.conversationId, interpolateVars(question, ctx.variables))
      }
      return { waitForInput: true }
    }

    case 'condition': {
      const { variable, operator, value } = node.data as {
        variable: string
        operator: 'eq' | 'contains' | 'starts_with' | 'gt' | 'lt'
        value: string
      }

      const actual = ctx.variables[variable] ?? ''
      let result = false

      switch (operator) {
        case 'eq':          result = actual.toLowerCase() === value.toLowerCase(); break
        case 'contains':    result = actual.toLowerCase().includes(value.toLowerCase()); break
        case 'starts_with': result = actual.toLowerCase().startsWith(value.toLowerCase()); break
        case 'gt':          result = Number(actual) > Number(value); break
        case 'lt':          result = Number(actual) < Number(value); break
      }

      return { nextNodeId: result ? node.nextTrue : node.nextFalse }
    }

    case 'action': {
      const { actionType } = node.data as { actionType: string }

      switch (actionType) {
        case 'set_status': {
          const { status } = node.data as { status: string }
          await updateContact(ctx.workspaceId, ctx.contactId, { status: status as never })
          break
        }
        case 'assign_human': {
          await assignConversation(ctx.workspaceId, ctx.conversationId, null, 'humano')
          break
        }
        case 'assign_ia': {
          await assignConversation(ctx.workspaceId, ctx.conversationId, null, 'ia')
          break
        }
        case 'add_tag': {
          const { tagIds } = node.data as { tagIds: string[] }
          await attachTags(ctx.workspaceId, ctx.contactId, tagIds)
          break
        }
        case 'set_variable': {
          const { key, value } = node.data as { key: string; value: string }
          ctx.variables[key] = interpolateVars(value, ctx.variables)
          break
        }
      }

      return { nextNodeId: node.next }
    }

    case 'ai': {
      // Delega para o agente de IA — o agente processará a próxima mensagem normalmente
      // Marca na conversa para usar IA no próximo turno
      await assignConversation(ctx.workspaceId, ctx.conversationId, null, 'ia')
      return { nextNodeId: node.next }
    }

    case 'follow_up': {
      const { delayHours, message } = node.data as { delayHours: number; message: string }
      const sendAt = Date.now() + delayHours * 3600000
      await redis.set(
        `flow:followup:${ctx.conversationId}:${node.id}`,
        JSON.stringify({
          workspaceId: ctx.workspaceId,
          conversationId: ctx.conversationId,
          message: interpolateVars(message, ctx.variables),
        }),
        { PXAT: sendAt + 5000 }
      )
      return { nextNodeId: node.next }
    }

    default:
      return { nextNodeId: node.next }
  }
}

// ==========================================================================
// Trigger de flow por evento
// ==========================================================================

export async function triggerFlowByEvent(
  workspaceId: string,
  trigger: string,
  ctx: Omit<FlowContext, 'variables'>
): Promise<void> {
  const flows = await query<{ id: string }>(
    `SELECT id FROM flows
     WHERE workspace_id = $1 AND trigger = $2 AND is_active = true`,
    [workspaceId, trigger]
  )

  for (const flow of flows.rows) {
    executeFlow(flow.id, { ...ctx, variables: {} }).catch((err) =>
      logger.error('Flow trigger failed', { flowId: flow.id, error: (err as Error).message })
    )
  }
}

// ==========================================================================
// Retoma fluxo quando cliente envia mensagem
// ==========================================================================

export async function resumeFlowOnMessage(
  workspaceId: string,
  conversationId: string,
  contactId: string,
  message: string
): Promise<boolean> {
  // Verifica se há algum fluxo aguardando input nesta conversa
  const keys = await redis.keys(`flow:state:${conversationId}:*`)
  if (!keys.length) return false

  for (const stateKey of keys) {
    const nodeId = await redis.get(stateKey)
    if (!nodeId) continue

    const flowId = stateKey.split(':')[3]
    const ctx: FlowContext = {
      workspaceId,
      conversationId,
      contactId,
      variables: {},
      lastMessage: message,
    }

    const flow = await getFlow(workspaceId, flowId)
    if (flow) {
      await runFromNode(flow, nodeId, ctx, stateKey)
      return true
    }
  }

  return false
}

// ==========================================================================
// CRUD de flows
// ==========================================================================

async function getFlow(workspaceId: string, flowId: string): Promise<Flow | null> {
  const result = await query<{
    id: string; workspace_id: string; name: string; trigger: string; nodes: FlowNode[]; is_active: boolean
  }>(
    `SELECT id, workspace_id, name, trigger, nodes, is_active FROM flows WHERE id = $1 AND workspace_id = $2`,
    [flowId, workspaceId]
  )
  if (!result.rowCount) return null
  const r = result.rows[0]
  return { id: r.id, workspaceId: r.workspace_id, name: r.name, trigger: r.trigger, nodes: r.nodes, isActive: r.is_active }
}

// ─── Field-name mapping helpers ────────────────────────────────────────────────
// Frontend usa: nextNodeId / conditionTrue / conditionFalse
// DB usa:       next       / nextTrue      / nextFalse
function toFrontendNode(n: Record<string, unknown>) {
  return {
    id: n.id,
    type: n.type,
    data: n.data,
    nextNodeId:     n.next      ?? n.nextNodeId,
    conditionTrue:  n.nextTrue  ?? n.conditionTrue,
    conditionFalse: n.nextFalse ?? n.conditionFalse,
  }
}

function toDbNode(n: Record<string, unknown>) {
  return {
    id:   n.id,
    type: n.type,
    data: n.data,
    next:      n.next      ?? n.nextNodeId,
    nextTrue:  n.nextTrue  ?? n.conditionTrue,
    nextFalse: n.nextFalse ?? n.conditionFalse,
  }
}

export async function listFlows(workspaceId: string) {
  const result = await query(
    `SELECT id, name,
            trigger      AS "triggerType",
            is_active    AS "isActive",
            nodes,
            created_at   AS "createdAt"
     FROM flows WHERE workspace_id = $1 ORDER BY name`,
    [workspaceId]
  )
  return result.rows.map(r => ({
    ...r,
    nodes: ((r.nodes ?? []) as Record<string, unknown>[]).map(toFrontendNode),
  }))
}

export async function getFlowById(workspaceId: string, flowId: string) {
  const result = await query(
    `SELECT id, name,
            trigger      AS "triggerType",
            is_active    AS "isActive",
            nodes,
            created_at   AS "createdAt",
            updated_at   AS "updatedAt"
     FROM flows WHERE id = $1 AND workspace_id = $2`,
    [flowId, workspaceId]
  )
  if (!result.rowCount) return null
  const r = result.rows[0]
  return {
    ...r,
    nodes: ((r.nodes ?? []) as Record<string, unknown>[]).map(toFrontendNode),
  }
}

export async function upsertFlow(workspaceId: string, dto: {
  id?: string
  name: string
  trigger?: string
  triggerType?: string
  nodes: Record<string, unknown>[]
  isActive?: boolean
}) {
  const trigger = dto.trigger ?? dto.triggerType
  const nodes = dto.nodes.map(toDbNode)

  if (dto.id) {
    await query(
      `UPDATE flows SET name=$1, trigger=$2, nodes=$3, is_active=COALESCE($4,is_active), updated_at=NOW()
       WHERE id=$5 AND workspace_id=$6`,
      [dto.name, trigger, JSON.stringify(nodes), dto.isActive ?? null, dto.id, workspaceId]
    )
    return getFlowById(workspaceId, dto.id)
  }

  const result = await query<{ id: string }>(
    `INSERT INTO flows (workspace_id, name, trigger, nodes, is_active)
     VALUES ($1,$2,$3,$4,COALESCE($5,false)) RETURNING id`,
    [workspaceId, dto.name, trigger, JSON.stringify(nodes), dto.isActive ?? false]
  )
  return getFlowById(workspaceId, result.rows[0].id)
}

export async function deleteFlow(workspaceId: string, flowId: string) {
  await query('DELETE FROM flows WHERE workspace_id=$1 AND id=$2', [workspaceId, flowId])
}

// ==========================================================================
// Helpers
// ==========================================================================

function interpolateVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}
