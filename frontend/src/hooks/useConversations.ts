import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useConversations(params?: { status?: string; search?: string; page?: number }) {
  const q = new URLSearchParams()
  if (params?.status) q.set('status', params.status)
  if (params?.search) q.set('search', params.search)
  if (params?.page) q.set('page', String(params.page))
  return useQuery({
    queryKey: ['conversations', params],
    queryFn: () => api.get(`/conversations?${q}`).then(r => r.data),
  })
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: ['conversations', id],
    queryFn: () => api.get(`/conversations/${id}`).then(r => r.data),
    enabled: !!id,
  })
}

export function useMessages(conversationId: string, page = 1) {
  return useQuery({
    queryKey: ['messages', conversationId, page],
    queryFn: () => api.get(`/conversations/${conversationId}/messages?page=${page}&limit=50`).then(r => r.data),
    enabled: !!conversationId,
  })
}

export function useAssignConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, type }: { id: string; type: 'ia' | 'humano' }) =>
      api.patch(`/conversations/${id}/assign`, { assigneeType: type }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  })
}

export function useCloseConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.patch(`/conversations/${id}/close`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  })
}

export function useSendMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ conversationId, content }: { conversationId: string; content: string }) =>
      api.post(`/whatsapp/send`, { conversationId, content }).then(r => r.data),
    onSuccess: (_data, { conversationId }) => {
      qc.invalidateQueries({ queryKey: ['messages', conversationId] })
    },
  })
}
