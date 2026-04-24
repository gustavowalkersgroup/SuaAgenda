import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useAppointments(params?: { date?: string; status?: string; professionalId?: string }) {
  const q = new URLSearchParams()
  if (params?.date) q.set('date', params.date)
  if (params?.status) q.set('status', params.status)
  if (params?.professionalId) q.set('professionalId', params.professionalId)
  return useQuery({
    queryKey: ['appointments', params],
    queryFn: () => api.get(`/appointments?${q}`).then(r => r.data),
  })
}

export function useAvailability(params: { date: string; serviceIds: string[] }) {
  return useQuery({
    queryKey: ['availability', params],
    queryFn: () =>
      api.post('/appointments/availability', params).then(r => r.data),
    enabled: !!params.date && params.serviceIds.length > 0,
  })
}

export function useConfirmAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.patch(`/appointments/${id}/confirm`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  })
}

export function useCancelAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.patch(`/appointments/${id}/cancel`, { reason }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  })
}

export function useProfessionals() {
  return useQuery({
    queryKey: ['professionals'],
    queryFn: () => api.get('/professionals').then(r => r.data),
  })
}

export function useServices() {
  return useQuery({
    queryKey: ['services'],
    queryFn: () => api.get('/services').then(r => r.data),
  })
}
