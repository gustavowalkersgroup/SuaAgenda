'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, MessageSquare, Calendar, Users,
  Settings, LogOut, Zap, BarChart2, Bell,
  UserCog, Scissors, Megaphone, GitBranch, Shield, ArrowLeftRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import { Avatar } from '@/components/ui/Avatar'

const navGroups = [
  {
    label: 'Principal',
    items: [
      { href: '/dashboard',     label: 'Dashboard',    icon: LayoutDashboard },
      { href: '/inbox',         label: 'Inbox',         icon: MessageSquare },
      { href: '/agenda',        label: 'Agenda',        icon: Calendar },
      { href: '/crm',           label: 'CRM',           icon: Users },
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
      { href: '/broadcasts',    label: 'Broadcasts',    icon: Megaphone },
      { href: '/flows',         label: 'Flows',         icon: GitBranch },
      { href: '/automations',   label: 'Automações',    icon: Zap },
    ],
  },
  {
    label: 'Dados',
    items: [
      { href: '/analytics',     label: 'Analytics',    icon: BarChart2 },
      { href: '/notifications', label: 'Notificações', icon: Bell },
      { href: '/settings',      label: 'Configurações',icon: Settings },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  const isSuperAdmin = typeof window !== 'undefined' && !!localStorage.getItem('sa_token')
  const hasSuperAdminRole = user?.role === 'super_admin'

  return (
    <aside className="flex flex-col w-60 min-h-screen bg-gray-900 text-white">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
            <MessageSquare size={16} className="text-white" />
          </div>
          <span className="font-semibold text-sm leading-tight">SaaS Atendimento</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto scrollbar-thin">
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

      {/* User */}
      {user && (
        <div className="px-3 py-4 border-t border-gray-700">
          <div className="flex items-center gap-3 px-2 mb-2">
            <Avatar name={user.name} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user.name}</p>
              <p className="text-xs text-gray-400 capitalize">{user.role}</p>
            </div>
          </div>

          {/* Link para Painel Admin */}
          {(hasSuperAdminRole || isSuperAdmin) && (
            <Link
              href="/admin"
              className={cn(
                'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors mb-1',
                pathname.startsWith('/admin')
                  ? 'bg-indigo-600 text-white'
                  : 'text-indigo-400 hover:bg-gray-800 hover:text-indigo-300'
              )}
            >
              <Shield size={16} />
              Painel Admin
            </Link>
          )}

          {/* Voltar ao admin (quando está dentro de um tenant) */}
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
              className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-amber-400 hover:bg-gray-800 hover:text-amber-300 transition-colors mb-1"
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
