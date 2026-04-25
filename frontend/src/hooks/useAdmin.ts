import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface AdminWorkspace {
  id: string
  name: string
  slug: string
  plan: string
  is_active: boolean
  created_at: string
  member_count: number
  owner_name: string | null
  owner_email: string | null
}

export function useAdminWorkspaces() {
  return useQuery({
    queryKey: ['admin', 'workspaces'],
    queryFn: async () => {
      const res = await api.get<{ workspaces: AdminWorkspace[] }>('/admin/workspaces')
      return res.data.workspaces
    },
  })
}

export function useEnterWorkspace() {
  return useMutation({
    mutationFn: async (workspaceId: string) => {
      const res = await api.post<{ token: string; workspaceName: string; role: string }>(
        `/admin/workspaces/${workspaceId}/enter`
      )
      return res.data
    },
  })
}

export function useToggleWorkspace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const res = await api.patch(`/admin/workspaces/${id}`, { is_active })
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'workspaces'] }),
  })
}
