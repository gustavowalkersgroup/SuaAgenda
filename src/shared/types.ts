import { Request } from 'express'

export interface AuthPayload {
  userId: string
  workspaceId: string
  role: UserRole
}

export type UserRole = 'super_admin' | 'admin' | 'atendente' | 'marketing'

export interface AuthRequest extends Request {
  auth: AuthPayload
}

export interface PaginationQuery {
  page?: number
  limit?: number
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
  pages: number
}

export type ContactStatus =
  | 'novo'
  | 'em_atendimento'
  | 'orcamento'
  | 'agendado'
  | 'concluido'
  | 'perdido'

export type AppointmentStatus =
  | 'PRE_RESERVADO'
  | 'CONFIRMADO'
  | 'CONCLUIDO'
  | 'CANCELADO'
  | 'EXPIRADO'
  | 'NO_SHOW'
