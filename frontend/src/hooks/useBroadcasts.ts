import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useBroadcasts(params?: { page?: number }) {
  const q = new URLSearchParams()
  q.set('page', String(params?.page ?? 1))
  q.set('limit', '20')
  return useQuery({
    queryKey: ['broadcasts', params],
    queryFn: () => api.get(`/broadcasts?${q}`).then(r => r.data),
  })
}

export function useBroadcast(id: string) {
  return useQuery({
    queryKey: ['broadcasts', id],
    queryFn: () => api.get(`/broadcasts/${id}`).then(r => r.data),
    enabled: !!id,
  })
}

export function useCreateBroadcast() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: object) => api.post('/broadcasts', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['broadcasts'] }),
  })
}

export function useStartBroadcast() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post(`/broadcasts/${id}/start`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['broadcasts'] }),
  })
}

export function useCancelBroadcast() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post(`/broadcasts/${id}/cancel`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['broadcasts'] }),
  })
}

export function useDeleteBroadcast() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/broadcasts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['broadcasts'] }),
  })
}
