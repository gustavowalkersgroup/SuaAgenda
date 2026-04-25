import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface AdminWorkspace {
  id: string
  name: string
  slug: string
  plan: string
  is_active: boolean
  created_at: string
  trial_ends_at: string | null
  max_contacts: number
  max_users: number
  billing_email: string | null
  notes: string | null
  timezone: string
  member_count: number
  owner_name: string | null
  owner_email: string | null
}

export interface WorkspaceMember {
  user_id: string
  name: string
  email: string
  role: string
  joined_at: string
}

export interface WorkspaceDetail extends AdminWorkspace {
  members: WorkspaceMember[]
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

export function useWorkspaceDetail(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'workspace', id],
    queryFn: async () => {
      const res = await api.get<WorkspaceDetail>(`/admin/workspaces/${id}`)
      return res.data
    },
    enabled: !!id,
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

export function useUpdateWorkspace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      const res = await api.patch(`/admin/workspaces/${id}`, data)
      return res.data
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['admin', 'workspaces'] })
      qc.invalidateQueries({ queryKey: ['admin', 'workspace', vars.id] })
    },
  })
}

export function useDeleteWorkspace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/workspaces/${id}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'workspaces'] }),
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

export function useRemoveMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ workspaceId, userId }: { workspaceId: string; userId: string }) => {
      await api.delete(`/admin/workspaces/${workspaceId}/members/${userId}`)
    },
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ['admin', 'workspace', vars.workspaceId] }),
  })
}

export function usePromoteUser() {
  return useMutation({
    mutationFn: async (email: string) => {
      const res = await api.post('/admin/promote', { email })
      return res.data
    },
  })
}
