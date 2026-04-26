'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard, MessageSquare, Calendar, Users,
  Settings, LogOut, Zap, BarChart2, Bell,
  UserCog, Scissors, Megaphone, GitBranch, Shield, ArrowLeftRight,
  ChevronDown, Building2, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import { Avatar } from '@/components/ui/Avatar'
import { api } from '@/lib/api'
import { useAdminWorkspaces, useEnterWorkspace } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'

const navGroups = [
  {
    label: 'Principal',
    items: [
      { href: '/dashboard',     label: 'Dashboard',        icon: LayoutDashboard },
      { href: '/inbox',         label: 'Caixa de Entrada', icon: MessageSquare },
      { href: '/agenda',        label: 'Agenda',           icon: Calendar },
      { href: '/crm',           label: 'CRM',              icon: Users },
    ],
  },
  {
    label: 'Operação',
    items: [
      { href: '/professionals', label: 'Profissionais', icon: UserCog },
      { href: '/services',      label: 'Serviços',      icon: Scissors },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { href: '/broadcasts',    label: 'Disparos',   icon: Megaphone },
      { href: '/flows',         label: 'Fluxos',     icon: GitBranch },
      { href: '/automations',   label: 'Automações', icon: Zap },
    ],
  },
  {
    label: 'Dados',
    items: [
      { href: '/analytics',     label: 'Análises',     icon: BarChart2 },
      { href: '/notifications', label: 'Notificações', icon: Bell },
      { href: '/settings',      label: 'Configurações',icon: Settings },
    ],
  },
]

// ─── Workspace switcher (super admin only) ─────────────────────────────────────
function WorkspaceSwitcher() {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const { data: workspaces, isLoading } = useAdminWorkspaces()
  const enterWorkspace = useEnterWorkspace()

  async function handleEnter(id: string, name: string) {
    try {
      const res = await enterWorkspace.mutateAsync(id)
      const original = localStorage.getItem('token')
      if (original) localStorage.setItem('sa_token', original)
      localStorage.setItem('token', res.token)
      localStorage.setItem('user', JSON.stringify({ name: res.workspaceName, role: res.role }))
      toast.success(`Entrando em ${name}`)
      setOpen(false)
      window.location.href = '/dashboard'
    } catch {
      toast.error('Erro ao entrar no workspace')
    }
  }

  return (
    <div className="relative px-3 mb-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-indigo-300 hover:bg-gray-800 hover:text-indigo-200 transition-colors"
      >
        <Building2 size={15} />
        <span className="flex-1 text-left">Trocar workspace</span>
        <ChevronDown size={13} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="mt-1 rounded-xl bg-gray-800 border border-gray-700 overflow-hidden shadow-xl">
          {isLoading ? (
            <p className="text-xs text-gray-400 px-3 py-2">Carregando...</p>
          ) : (
            <div className="max-h-52 overflow-y-auto">
              {(workspaces ?? []).map(ws => (
                <button
                  key={ws.id}
                  onClick={() => handleEnter(ws.id, ws.name)}
                  className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-700 transition-colors text-left"
                >
                  <div className="w-5 h-5 rounded bg-primary-600 flex items-center justify-center shrink-0">
                    <span className="text-[9px] font-bold text-white">{ws.name[0]?.toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-xs font-medium text-white">{ws.name}</p>
                    <p className="text-[10px] text-gray-500 capitalize">{ws.plan}</p>
                  </div>
                  {!ws.is_active && (
                    <span className="text-[9px] bg-red-900 text-red-300 px-1.5 py-0.5 rounded-full">inativo</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Sidebar ───────────────────────────────────────────────────────────────────
export function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  const isSuperAdmin = typeof window !== 'undefined' && !!localStorage.getItem('sa_token')
  const hasSuperAdminRole = user?.role === 'super_admin'

  const { data: workspace } = useQuery({
    queryKey: ['workspace'],
    queryFn: () => api.get('/workspaces/current').then(r => r.data),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  })

  return (
    <aside className="flex flex-col w-64 h-full bg-gray-900 text-white shadow-2xl">
      {/* Logo + close mobile */}
      <div className="px-5 py-4 border-b border-gray-700 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center shrink-0">
          <MessageSquare size={16} className="text-white" />
        </div>
        <span className="font-semibold text-sm leading-tight truncate flex-1">
          {workspace?.name ?? 'SuaAgenda'}
        </span>
        {/* Botão fechar no mobile */}
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto">
        {navGroups.map(group => (
          <div key={group.label}>
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = pathname.startsWith(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary-600 text-white'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                    )}
                  >
                    <Icon size={16} />
                    {label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User section */}
      {user && (
        <div className="px-3 py-4 border-t border-gray-700 space-y-0.5">
          <div className="flex items-center gap-3 px-2 mb-3">
            <Avatar name={user.name} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user.name}</p>
              <p className="text-xs text-gray-400 capitalize">{user.role?.replace('_', ' ')}</p>
            </div>
          </div>

          {/* Super admin: trocar workspace */}
          {hasSuperAdminRole && <WorkspaceSwitcher />}

          {/* Link para Painel Admin */}
          {(hasSuperAdminRole || isSuperAdmin) && (
            <Link
              href="/admin"
              className={cn(
                'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors',
                pathname.startsWith('/admin')
                  ? 'bg-indigo-600 text-white'
                  : 'text-indigo-400 hover:bg-gray-800 hover:text-indigo-300'
              )}
            >
              <Shield size={16} />
              Painel Admin
            </Link>
          )}

          {/* Voltar ao admin (quando está dentro de um tenant como super_admin) */}
          {isSuperAdmin && !hasSuperAdminRole && (
            <button
              onClick={() => {
                const sa = localStorage.getItem('sa_token')
                if (sa) {
                  localStorage.setItem('token', sa)
                  localStorage.removeItem('sa_token')
                  window.location.href = '/admin'
                }
              }}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-amber-400 hover:bg-gray-800 hover:text-amber-300 transition-colors"
            >
              <ArrowLeftRight size={16} />
              Sair do Tenant
            </button>
          )}

          <button
            onClick={logout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <LogOut size={16} />
            Sair
          </button>
        </div>
      )}
    </aside>
  )
}
