import axios from 'axios'
import { env } from '../../config/env'
import { logger } from '../../config/logger'

const http = axios.create({
  baseURL: env.EVOLUTION_API_URL,
  headers: {
    apikey: env.EVOLUTION_API_KEY,
    'Content-Type': 'application/json',
  },
  timeout: 15000,
})

export interface SendTextParams {
  instanceName: string
  to: string
  text: string
  delay?: number
}

export interface SendMediaParams {
  instanceName: string
  to: string
  mediaType: 'image' | 'audio' | 'video' | 'document'
  url: string
  caption?: string
  fileName?: string
}

export async function sendText(params: SendTextParams) {
  const { instanceName, to, text, delay = 0 } = params
  const response = await http.post(`/message/sendText/${instanceName}`, {
    number: to,
    text,
    delay,
  })
  return response.data
}

export async function sendMedia(params: SendMediaParams) {
  const { instanceName, to, mediaType, url, caption, fileName } = params
  const response = await http.post(`/message/sendMedia/${instanceName}`, {
    number: to,
    mediatype: mediaType,
    media: url,
    caption,
    fileName,
  })
  return response.data
}

const WEBHOOK_EVENTS = [
  'MESSAGES_UPSERT',
  'MESSAGES_UPDATE',
  'CONNECTION_UPDATE',
  'QRCODE_UPDATED',
]

export async function createInstance(instanceName: string, webhookUrl: string) {
  // Evolution v2.2.x: cria a instância sem webhook no payload (formato v1 não pega)
  const response = await http.post('/instance/create', {
    instanceName,
    qrcode: true,
    integration: 'WHATSAPP-BAILEYS',
  })

  // Configura o webhook em endpoint separado — formato v2.2.x correto
  try {
    await setWebhook(instanceName, webhookUrl)
  } catch (err) {
    // Se falhar, ainda retorna a instância criada (a configuração do webhook pode ser refeita)
    // mas loga pra investigar
    console.error('[evolution.createInstance] setWebhook failed', {
      instanceName,
      error: (err as Error).message,
    })
  }

  return response.data
}

export async function setWebhook(instanceName: string, url: string) {
  // Evolution v2.2+ exige enabled+webhookByEvents+webhookBase64 (não os nomes do v1)
  const response = await http.post(`/webhook/set/${instanceName}`, {
    webhook: {
      enabled: true,
      url,
      webhookByEvents: false,
      webhookBase64: true,
      events: WEBHOOK_EVENTS,
    },
  })
  return response.data
}

export async function getWebhook(instanceName: string) {
  const response = await http.get(`/webhook/find/${instanceName}`)
  return response.data
}

export async function getInstanceStatus(instanceName: string) {
  const response = await http.get(`/instance/connectionState/${instanceName}`)
  return response.data
}

export async function getQrCode(instanceName: string) {
  const response = await http.get(`/instance/connect/${instanceName}`)
  return response.data
}

export async function logoutInstance(instanceName: string) {
  const response = await http.delete(`/instance/logout/${instanceName}`)
  return response.data
}

export async function deleteInstance(instanceName: string) {
  const response = await http.delete(`/instance/delete/${instanceName}`)
  return response.data
}

export function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (!digits.startsWith('55')) return `55${digits}`
  return digits
}

http.interceptors.response.use(
  (r) => r,
  (err) => {
    logger.error('Evolution API error', {
      status: err.response?.status,
      data: err.response?.data,
      url: err.config?.url,
    })
    return Promise.reject(err)
  }
)
