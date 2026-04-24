import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useFlows() {
  return useQuery({
    queryKey: ['flows'],
    queryFn: () => api.get('/flows').then(r => r.data),
  })
}

export function useFlow(id: string) {
  return useQuery({
    queryKey: ['flows', id],
    queryFn: () => api.get(`/flows/${id}`).then(r => r.data),
    enabled: !!id,
  })
}

export function useUpsertFlow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: object) => api.post('/flows', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flows'] }),
  })
}

export function useUpdateFlow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      api.put(`/flows/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flows'] }),
  })
}

export function useDeleteFlow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/flows/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flows'] }),
  })
}
