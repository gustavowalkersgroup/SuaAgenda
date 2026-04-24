import { PaginatedResult } from './types'

export function paginate<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResult<T> {
  return {
    data,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  }
}

export function getPaginationParams(query: Record<string, unknown>): {
  page: number
  limit: number
  offset: number
} {
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20))
  return { page, limit, offset: (page - 1) * limit }
}
