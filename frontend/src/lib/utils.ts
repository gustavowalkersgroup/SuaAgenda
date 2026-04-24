import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date, pattern = 'dd/MM/yyyy') {
  return format(new Date(date), pattern, { locale: ptBR })
}

export function formatDateTime(date: string | Date) {
  return format(new Date(date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
}

export function formatRelative(date: string | Date) {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR })
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 13) return `+${digits.slice(0,2)} (${digits.slice(2,4)}) ${digits.slice(4,9)}-${digits.slice(9)}`
  if (digits.length === 11) return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`
  return phone
}

export function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    PRE_RESERVADO: 'Pré-reservado',
    CONFIRMADO: 'Confirmado',
    CANCELADO: 'Cancelado',
    CONCLUIDO: 'Concluído',
    NO_SHOW: 'Não compareceu',
    ativo: 'Ativo',
    inativo: 'Inativo',
    bloqueado: 'Bloqueado',
    lead: 'Lead',
    aberta: 'Aberta',
    fechada: 'Fechada',
  }
  return map[status] ?? status
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    PRE_RESERVADO: 'bg-yellow-100 text-yellow-800',
    CONFIRMADO: 'bg-green-100 text-green-800',
    CANCELADO: 'bg-red-100 text-red-800',
    CONCLUIDO: 'bg-blue-100 text-blue-800',
    NO_SHOW: 'bg-gray-100 text-gray-800',
    ativo: 'bg-green-100 text-green-800',
    inativo: 'bg-gray-100 text-gray-800',
    bloqueado: 'bg-red-100 text-red-800',
    lead: 'bg-purple-100 text-purple-800',
    aberta: 'bg-blue-100 text-blue-800',
    fechada: 'bg-gray-100 text-gray-800',
  }
  return map[status] ?? 'bg-gray-100 text-gray-800'
}
