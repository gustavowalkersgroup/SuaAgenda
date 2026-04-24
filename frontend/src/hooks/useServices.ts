import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useServices(params?: { search?: string; page?: number }) {
  const q = new URLSearchParams()
  if (params?.search) q.set('search', params.search)
  q.set('page', String(params?.page ?? 1))
  q.set('limit', '20')
  return useQuery({
    queryKey: ['services', params],
    queryFn: () => api.get(`/services?${q}`).then(r => r.data),
  })
}

export function useService(id: string) {
  return useQuery({
    queryKey: ['services', id],
    queryFn: () => api.get(`/services/${id}`).then(r => r.data),
    enabled: !!id,
  })
}

export function useCreateService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: object) => api.post('/services', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  })
}

export function useUpdateService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      api.put(`/services/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  })
}

export function useDeleteService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/services/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  })
}
