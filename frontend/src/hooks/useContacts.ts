import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useContacts(params?: { status?: string; tag?: string; search?: string; page?: number }) {
  const q = new URLSearchParams()
  if (params?.status) q.set('status', params.status)
  if (params?.tag) q.set('tag', params.tag)
  if (params?.search) q.set('search', params.search)
  q.set('page', String(params?.page ?? 1))
  q.set('limit', '20')
  return useQuery({
    queryKey: ['contacts', params],
    queryFn: () => api.get(`/contacts?${q}`).then(r => r.data),
  })
}

export function useContact(id: string) {
  return useQuery({
    queryKey: ['contacts', id],
    queryFn: () => api.get(`/contacts/${id}`).then(r => r.data),
    enabled: !!id,
  })
}

export function useCreateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; phone: string; email?: string }) =>
      api.post('/contacts', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  })
}

export function useUpdateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; email?: string; status?: string }) =>
      api.put(`/contacts/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  })
}

export function useContactAppointments(contactId: string) {
  return useQuery({
    queryKey: ['contacts', contactId, 'appointments'],
    queryFn: () => api.get(`/appointments?contactId=${contactId}&limit=10`).then(r => r.data),
    enabled: !!contactId,
  })
}
