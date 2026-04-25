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

export async function createInstance(instanceName: string, webhookUrl: string) {
  const response = await http.post('/instance/create', {
    instanceName,
    qrcode: true,
    integration: 'WHATSAPP-BAILEYS',
    webhook: {
      url: webhookUrl,
      byEvents: false,  // v2: false = todos os eventos no mesmo endpoint
      base64: true,     // QR Code como base64 para exibir no browser
      events: [
        'MESSAGES_UPSERT',
        'MESSAGES_UPDATE',
        'CONNECTION_UPDATE',
        'QRCODE_UPDATED',
      ],
    },
  })
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
