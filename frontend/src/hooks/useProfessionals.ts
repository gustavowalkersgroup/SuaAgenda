import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useProfessionals(params?: { search?: string; page?: number }) {
  const q = new URLSearchParams()
  if (params?.search) q.set('search', params.search)
  q.set('page', String(params?.page ?? 1))
  q.set('limit', '20')
  return useQuery({
    queryKey: ['professionals', params],
    queryFn: () => api.get(`/professionals?${q}`).then(r => r.data),
  })
}

export function useProfessional(id: string) {
  return useQuery({
    queryKey: ['professionals', id],
    queryFn: () => api.get(`/professionals/${id}`).then(r => r.data),
    enabled: !!id,
  })
}

export function useCreateProfessional() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: object) => api.post('/professionals', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['professionals'] }),
  })
}

export function useUpdateProfessional() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      api.put(`/professionals/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['professionals'] }),
  })
}

export function useDeleteProfessional() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/professionals/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['professionals'] }),
  })
}

export function useProfessionalSchedules(professionalId: string) {
  return useQuery({
    queryKey: ['professionals', professionalId, 'schedules'],
    queryFn: () => api.get(`/professionals/${professionalId}/schedules`).then(r => r.data),
    enabled: !!professionalId,
  })
}

export function useUpdateSchedules() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ professionalId, schedules }: { professionalId: string; schedules: object[] }) =>
      api.put(`/professionals/${professionalId}/schedules`, { schedules }).then(r => r.data),
    onSuccess: (_d, { professionalId }) =>
      qc.invalidateQueries({ queryKey: ['professionals', professionalId, 'schedules'] }),
  })
}

export function useAvailabilityBlocks(professionalId: string) {
  return useQuery({
    queryKey: ['professionals', professionalId, 'blocks'],
    queryFn: () => api.get(`/professionals/${professionalId}/blocks`).then(r => r.data),
    enabled: !!professionalId,
  })
}

export function useCreateBlock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ professionalId, ...data }: { professionalId: string } & Record<string, unknown>) =>
      api.post(`/professionals/${professionalId}/blocks`, data).then(r => r.data),
    onSuccess: (_d, { professionalId }) =>
      qc.invalidateQueries({ queryKey: ['professionals', professionalId, 'blocks'] }),
  })
}

export function useDeleteBlock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ professionalId, blockId }: { professionalId: string; blockId: string }) =>
      api.delete(`/professionals/${professionalId}/blocks/${blockId}`),
    onSuccess: (_d, { professionalId }) =>
      qc.invalidateQueries({ queryKey: ['professionals', professionalId, 'blocks'] }),
  })
}
