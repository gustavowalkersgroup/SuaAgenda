/**
 * AI Functions (Tool Use)
 *
 * Define as ferramentas disponíveis para o agente de IA e seus handlers.
 * O agente NUNCA inventa horários — usa estas funções obrigatoriamente.
 */

import OpenAI from 'openai'
import { addDays } from 'date-fns'
import { searchAvailability, createAppointment } from '../appointments/appointments.service'
import { cancelAppointment } from '../appointments/appointments.service'
import { listServices } from '../services/services.service'
import { createPaymentLink } from '../payments/payments.service'
import { logger } from '../../config/logger'

export type FunctionName =
  | 'listar_servicos'
  | 'buscar_horarios'
  | 'criar_agendamento'
  | 'cancelar_agendamento'
  | 'transferir_humano'

export const AI_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'listar_servicos',
      description: 'Lista todos os serviços disponíveis no estabelecimento com preço e duração.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_horarios',
      description:
        'Busca horários disponíveis para um ou mais serviços. ' +
        'Retorna até 9 sugestões de horário. ' +
        'OBRIGATÓRIO chamar antes de confirmar qualquer agendamento.',
      parameters: {
        type: 'object',
        properties: {
          service_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'IDs dos serviços desejados (máx 3)',
          },
          data_preferida: {
            type: 'string',
            description: 'Data preferida no formato ISO 8601 (opcional)',
          },
        },
        required: ['service_ids'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'criar_agendamento',
      description:
        'Cria o agendamento com o horário escolhido pelo cliente. ' +
        'Só chamar após o cliente confirmar explicitamente o horário.',
      parameters: {
        type: 'object',
        properties: {
          contact_id: {
            type: 'string',
            description: 'ID do contato/cliente',
          },
          conversation_id: {
            type: 'string',
            description: 'ID da conversa atual',
          },
          assignments: {
            type: 'array',
            description: 'Atribuições serviço-profissional-horário escolhidas',
            items: {
              type: 'object',
              properties: {
                serviceId: { type: 'string' },
                serviceName: { type: 'string' },
                professionalId: { type: 'string' },
                startAt: { type: 'string', description: 'ISO 8601' },
                endAt: { type: 'string', description: 'ISO 8601' },
              },
              required: ['serviceId', 'serviceName', 'professionalId', 'startAt', 'endAt'],
            },
          },
          notes: {
            type: 'string',
            description: 'Observações do cliente (opcional)',
          },
        },
        required: ['contact_id', 'conversation_id', 'assignments'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancelar_agendamento',
      description: 'Cancela um agendamento existente do cliente.',
      parameters: {
        type: 'object',
        properties: {
          appointment_id: {
            type: 'string',
            description: 'ID do agendamento a cancelar',
          },
          motivo: {
            type: 'string',
            description: 'Motivo do cancelamento',
          },
        },
        required: ['appointment_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'transferir_humano',
      description:
        'Transfere o atendimento para um humano. ' +
        'Usar quando: cliente pedir explicitamente, ou após 2 tentativas falhas de entender o pedido.',
      parameters: {
        type: 'object',
        properties: {
          motivo: {
            type: 'string',
            description: 'Motivo da transferência',
          },
        },
        required: ['motivo'],
      },
    },
  },
]

export interface FunctionContext {
  workspaceId: string
  contactId: string
  conversationId: string
}

export interface FunctionResult {
  success: boolean
  data?: unknown
  transferToHuman?: boolean
  message?: string
}

export async function executeFunction(
  name: FunctionName,
  args: Record<string, unknown>,
  ctx: FunctionContext
): Promise<FunctionResult> {
  logger.debug('AI function call', { name, args: JSON.stringify(args) })

  try {
    switch (name) {
      case 'listar_servicos': {
        const result = await listServices(ctx.workspaceId, { limit: 50 })
        return {
          success: true,
          data: (result.data as { id: string; name: string; duration_minutes: number; price: number; is_active: boolean }[]).map((s) => ({
            id: s.id,
            nome: s.name,
            duracaoMinutos: s.duration_minutes,
            preco: s.price,
            ativo: s.is_active,
          })),
        }
      }

      case 'buscar_horarios': {
        const serviceIds = args.service_ids as string[]
        const from = args.data_preferida
          ? new Date(args.data_preferida as string)
          : new Date()
        const to = addDays(from, 7)

        const result = await searchAvailability({
          workspaceId: ctx.workspaceId,
          serviceIds,
          from: from.toISOString(),
          to: to.toISOString(),
        })

        return {
          success: true,
          data: {
            sugestoes: result.suggestions.slice(0, 9).map((s, idx) => ({
              opcao: idx + 1,
              inicio: s.startsAt,
              fim: s.endsAt,
              totalMinutos: s.totalMinutes,
              servicos: s.assignments.map((a) => ({
                serviceId: a.serviceId,
                serviceName: a.serviceName,
                professionalId: a.professionalId,
                startAt: a.startAt,
                endAt: a.endAt,
              })),
            })),
          },
        }
      }

      case 'criar_agendamento': {
        const assignments = (args.assignments as Array<{
          serviceId: string
          serviceName: string
          professionalId: string
          startAt: string
          endAt: string
        }>).map((a) => ({
          serviceId: a.serviceId,
          serviceName: a.serviceName,
          professionalId: a.professionalId,
          startAt: new Date(a.startAt),
          endAt: new Date(a.endAt),
        }))

        const appointment = await createAppointment(ctx.workspaceId, {
          contactId: args.contact_id as string || ctx.contactId,
          conversationId: args.conversation_id as string || ctx.conversationId,
          services: assignments.map((a) => ({ serviceId: a.serviceId })),
          selectedAssignments: assignments,
          notes: args.notes as string | undefined,
        })

        // Gera link de pagamento se houver taxa de reserva
        let checkoutUrl: string | null = null
        try {
          const url = await createPaymentLink(ctx.workspaceId, appointment.id)
          if (url !== 'SEM_TAXA') checkoutUrl = url
        } catch {
          // Gateway não configurado: agendamento segue sem pagamento antecipado
        }

        return {
          success: true,
          data: {
            agendamentoId: appointment.id,
            status: appointment.status,
            inicio: appointment.starts_at,
            fim: appointment.ends_at,
            total: appointment.total_price,
            deposito: appointment.deposit_amount,
            expiraEm: appointment.expires_at,
            linkPagamento: checkoutUrl,
          },
        }
      }

      case 'cancelar_agendamento': {
        await cancelAppointment(
          ctx.workspaceId,
          args.appointment_id as string,
          args.motivo as string | undefined
        )
        return { success: true, data: { cancelado: true } }
      }

      case 'transferir_humano': {
        return {
          success: true,
          transferToHuman: true,
          message: args.motivo as string,
        }
      }

      default:
        return { success: false, data: { erro: 'Função desconhecida' } }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    logger.error('AI function error', { name, error: msg })
    return { success: false, data: { erro: msg } }
  }
}
