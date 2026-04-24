/**
 * AI Agent — Orquestrador principal
 *
 * Fluxo:
 * 1. Recebe mensagem do cliente
 * 2. Monta contexto (histórico + config do tenant)
 * 3. Chama OpenAI com tools habilitadas
 * 4. Se houver tool_call → executa → re-envia resultado → repete
 * 5. Envia resposta final via WhatsApp
 * 6. Após 2 falhas → transfere para humano
 * 7. Após transferência para humano → pausa IA por 1h, depois retoma
 */

import OpenAI from 'openai'
import { query } from '../../db/client'
import { getAiConfig, getOpenAiKey } from './ai.config.service'
import { AI_TOOLS, executeFunction, FunctionContext, FunctionName } from './ai.functions'
import { sendMessage } from '../whatsapp/whatsapp.service'
import { assignConversation } from '../conversations/conversations.service'
import { isWaitlistResponse, acceptWaitlistOffer } from '../waitlist/waitlist.service'
import { resumeFlowOnMessage } from '../../engine/flow.engine'
import { logger } from '../../config/logger'

const MAX_TOOL_ITERATIONS = 8
const MAX_FAILURES_BEFORE_HANDOFF = 2
const FAILURE_CACHE_TTL_SECONDS = 3600

interface AgentInput {
  workspaceId: string
  conversationId: string
  contactId: string
  contactPhone: string
  contactName: string | null
  inboundText: string
}

export async function runAgent(input: AgentInput): Promise<void> {
  const { workspaceId, conversationId, contactId, contactPhone, inboundText } = input

  // Verifica se IA está pausada (humano assumiu)
  const pausedUntil = await getAiPausedUntil(conversationId)
  if (pausedUntil && pausedUntil > new Date()) {
    logger.debug('AI paused for conversation', { conversationId, pausedUntil })
    return
  }

  // Verifica se há um flow ativo aguardando input nesta conversa
  const handledByFlow = await resumeFlowOnMessage(workspaceId, conversationId, contactId, inboundText)
  if (handledByFlow) return

  // Intercepta resposta de oferta de encaixe (waitlist) antes de chamar a IA
  const isWaitlist = await isWaitlistResponse(conversationId, inboundText)
  if (isWaitlist) {
    const accepted = await acceptWaitlistOffer(workspaceId, conversationId, contactId)
    if (accepted) {
      await sendMessage(
        workspaceId,
        conversationId,
        '✅ Ótimo! Sua vaga foi reservada. Em breve entraremos em contato para confirmar os detalhes. 🎉'
      )
      return
    }
    // Se não aceito (vaga já preenchida), a própria função já notificou o cliente
    return
  }

  // Verifica se IA está ativa para este workspace
  const config = await getAiConfig(workspaceId)
  if (!config.isActive) return

  let apiKey: string
  try {
    apiKey = await getOpenAiKey(workspaceId)
  } catch {
    logger.warn('No OpenAI API key for workspace', { workspaceId })
    return
  }

  const openai = new OpenAI({ apiKey })

  // Monta system prompt
  const systemPrompt = buildSystemPrompt(config, input)

  // Busca histórico recente da conversa (últimas 20 mensagens)
  const history = await getConversationHistory(workspaceId, conversationId, 20)

  // Adiciona mensagem atual
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: inboundText },
  ]

  const ctx: FunctionContext = { workspaceId, contactId, conversationId }

  let iterations = 0
  let transferToHuman = false
  let finalResponse: string | null = null

  try {
    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++

      const response = await openai.chat.completions.create({
        model: config.model,
        messages,
        tools: AI_TOOLS,
        tool_choice: 'auto',
        temperature: config.temperature,
        max_tokens: config.maxTokens,
      })

      const choice = response.choices[0]
      const assistantMessage = choice.message

      messages.push(assistantMessage)

      // Sem tool calls → resposta final
      if (!assistantMessage.tool_calls?.length) {
        finalResponse = assistantMessage.content
        break
      }

      // Processa cada tool call
      for (const toolCall of assistantMessage.tool_calls) {
        const fnName = toolCall.function.name as FunctionName
        const fnArgs = JSON.parse(toolCall.function.arguments) as Record<string, unknown>

        const result = await executeFunction(fnName, fnArgs, ctx)

        if (result.transferToHuman) {
          transferToHuman = true
          finalResponse = `Vou transferir você para um de nossos atendentes. ${result.message || 'Um momento!'}`
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result.data ?? result),
        })
      }

      if (transferToHuman) break
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    logger.error('AI agent error', { workspaceId, conversationId, error: msg })

    const failures = await incrementFailureCount(conversationId)
    if (failures >= MAX_FAILURES_BEFORE_HANDOFF) {
      transferToHuman = true
      finalResponse = 'Não consegui processar sua solicitação. Vou chamar um atendente para te ajudar!'
      await resetFailureCount(conversationId)
    } else {
      finalResponse = 'Desculpe, tive um problema técnico. Pode repetir o que deseja?'
    }
  }

  // Envia resposta
  if (finalResponse) {
    try {
      await sendMessage(workspaceId, conversationId, finalResponse)
    } catch (err) {
      logger.error('Failed to send AI response', { conversationId, error: (err as Error).message })
    }
  }

  // Transfere para humano se necessário
  if (transferToHuman) {
    await assignConversation(workspaceId, conversationId, null, 'humano')
    logger.info('Conversation transferred to human', { conversationId })
  }
}

function buildSystemPrompt(
  config: { systemPrompt: string; persona: string | null; faq: string | null },
  input: AgentInput
): string {
  const parts: string[] = []

  if (config.persona) {
    parts.push(`Seu nome é ${config.persona}.`)
  }

  parts.push(config.systemPrompt)

  if (input.contactName) {
    parts.push(`\nO cliente se chama ${input.contactName}.`)
  }

  if (config.faq) {
    parts.push(`\n## Perguntas Frequentes:\n${config.faq}`)
  }

  parts.push(`\nData/hora atual: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`)

  return parts.join('\n')
}

async function getConversationHistory(
  workspaceId: string,
  conversationId: string,
  limit: number
): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> {
  const result = await query<{
    direction: 'inbound' | 'outbound'
    content: string | null
    sent_by: string | null
  }>(
    `SELECT direction, content, sent_by
     FROM messages
     WHERE conversation_id = $1 AND workspace_id = $2
       AND type = 'text' AND content IS NOT NULL
     ORDER BY created_at DESC
     LIMIT $3`,
    [conversationId, workspaceId, limit]
  )

  return result.rows
    .reverse()
    .map((m) => ({
      role: m.direction === 'inbound' ? 'user' : 'assistant',
      content: m.content ?? '',
    }))
}

async function getAiPausedUntil(conversationId: string): Promise<Date | null> {
  const result = await query<{ ai_paused_until: string | null }>(
    'SELECT ai_paused_until FROM conversations WHERE id = $1',
    [conversationId]
  )
  const val = result.rows[0]?.ai_paused_until
  return val ? new Date(val) : null
}

// Contador de falhas por conversa — armazenado no Redis
async function incrementFailureCount(conversationId: string): Promise<number> {
  const { redis } = await import('../../db/redis')
  const key = `ai:failures:${conversationId}`
  const count = await redis.incr(key)
  await redis.expire(key, FAILURE_CACHE_TTL_SECONDS)
  return count
}

async function resetFailureCount(conversationId: string): Promise<void> {
  const { redis } = await import('../../db/redis')
  await redis.del(`ai:failures:${conversationId}`)
}
