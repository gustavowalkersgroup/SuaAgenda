import { query } from '../../db/client'
import { NotFoundError } from '../../shared/errors'

export interface AiConfig {
  id: string
  workspaceId: string
  model: string
  systemPrompt: string
  persona: string | null
  faq: string | null
  temperature: number
  maxTokens: number
  isActive: boolean
}

const DEFAULT_PROMPT = `Você é um assistente de agendamento. Seu trabalho é:
1. Identificar o serviço desejado pelo cliente
2. Buscar horários disponíveis usando as ferramentas disponíveis
3. Sugerir até 3 opções de horário
4. Confirmar a escolha do cliente
5. Criar o agendamento

Regras:
- Nunca invente horários. Use sempre as ferramentas para buscar disponibilidade.
- Seja cordial e objetivo.
- Se não entender o pedido após 2 tentativas, transfira para um atendente humano.
- Responda sempre em português brasileiro.`

export async function getAiConfig(workspaceId: string): Promise<AiConfig> {
  const result = await query<{
    id: string
    workspace_id: string
    model: string
    system_prompt: string
    persona: string | null
    faq: string | null
    temperature: number
    max_tokens: number
    is_active: boolean
  }>(
    `SELECT id, workspace_id, model, system_prompt, persona, faq, temperature, max_tokens, is_active
     FROM ai_configs WHERE workspace_id = $1`,
    [workspaceId]
  )

  if (!result.rowCount) {
    // Cria config padrão automaticamente
    return createDefaultConfig(workspaceId)
  }

  const r = result.rows[0]
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    model: r.model,
    systemPrompt: r.system_prompt,
    persona: r.persona,
    faq: r.faq,
    temperature: Number(r.temperature),
    maxTokens: r.max_tokens,
    isActive: r.is_active,
  }
}

async function createDefaultConfig(workspaceId: string): Promise<AiConfig> {
  const result = await query<{ id: string }>(
    `INSERT INTO ai_configs (workspace_id, system_prompt)
     VALUES ($1, $2) RETURNING id`,
    [workspaceId, DEFAULT_PROMPT]
  )

  return {
    id: result.rows[0].id,
    workspaceId,
    model: 'gpt-4o',
    systemPrompt: DEFAULT_PROMPT,
    persona: null,
    faq: null,
    temperature: 0.7,
    maxTokens: 1000,
    isActive: true,
  }
}

export async function updateAiConfig(
  workspaceId: string,
  dto: Partial<{
    model: string
    systemPrompt: string
    persona: string
    faq: string
    temperature: number
    maxTokens: number
    isActive: boolean
  }>
): Promise<AiConfig> {
  const fields: string[] = []
  const values: unknown[] = []
  let i = 1

  if (dto.model !== undefined) { fields.push(`model = $${i++}`); values.push(dto.model) }
  if (dto.systemPrompt !== undefined) { fields.push(`system_prompt = $${i++}`); values.push(dto.systemPrompt) }
  if (dto.persona !== undefined) { fields.push(`persona = $${i++}`); values.push(dto.persona) }
  if (dto.faq !== undefined) { fields.push(`faq = $${i++}`); values.push(dto.faq) }
  if (dto.temperature !== undefined) { fields.push(`temperature = $${i++}`); values.push(dto.temperature) }
  if (dto.maxTokens !== undefined) { fields.push(`max_tokens = $${i++}`); values.push(dto.maxTokens) }
  if (dto.isActive !== undefined) { fields.push(`is_active = $${i++}`); values.push(dto.isActive) }

  if (fields.length) {
    values.push(workspaceId)
    await query(
      `UPDATE ai_configs SET ${fields.join(', ')} WHERE workspace_id = $${i}`,
      values
    )
  }

  return getAiConfig(workspaceId)
}

export async function getOpenAiKey(workspaceId: string): Promise<string> {
  const result = await query<{ openai_api_key: string | null }>(
    'SELECT openai_api_key FROM workspaces WHERE id = $1',
    [workspaceId]
  )

  const encryptedKey = result.rows[0]?.openai_api_key
  if (!encryptedKey) throw new NotFoundError('OpenAI API key não configurada para este workspace')

  const { decryptApiKey } = await import('../workspaces/workspaces.service')
  return decryptApiKey(encryptedKey)
}
