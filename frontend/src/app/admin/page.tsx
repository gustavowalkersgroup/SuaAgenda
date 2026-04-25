'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2, Users, Calendar, Search, LogIn, Power, PowerOff,
  Shield, ChevronRight, RefreshCw, Crown
} from 'lucide-react'
import { useAdminWorkspaces, useEnterWorkspace, useToggleWorkspace, AdminWorkspace } from '@/hooks/useAdmin'
import { useQueryClient } from '@tanstack/react-query'

const PLAN_COLORS: Record<string, string> = {
  starter:    'bg-slate-100 text-slate-600',
  pro:        'bg-blue-100 text-blue-700',
  enterprise: 'bg-purple-100 text-purple-700',
}

const AVATAR_COLORS = [
  'bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500',
  'bg-teal-500', 'bg-cyan-500', 'bg-blue-500', 'bg-violet-500', 'bg-pink-500',
]

function avatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function fmt(date: string) {
  return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function AdminPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [entering, setEntering] = useState<string | null>(null)

  const { data: workspaces = [], isLoading, refetch } = useAdminWorkspaces()
  const enterMutation = useEnterWorkspace()
  const toggleMutation = useToggleWorkspace()

  const filtered = workspaces.filter(w =>
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    w.slug.toLowerCase().includes(search.toLowerCase()) ||
    (w.owner_email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const active   = workspaces.filter(w => w.is_active).length
  const inactive = workspaces.filter(w => !w.is_active).length
  const members  = workspaces.reduce((s, w) => s + w.member_count, 0)

  async function handleEnter(workspace: AdminWorkspace) {
    setEntering(workspace.id)
    try {
      const result = await enterMutation.mutateAsync(workspace.id)
      // Salva token atual como super-admin token e troca
      const currentToken = localStorage.getItem('token')
      if (currentToken) localStorage.setItem('sa_token', currentToken)
      localStorage.setItem('token', result.token)
      qc.clear()
      router.push('/dashboard')
    } finally {
      setEntering(null)
    }
  }

  async function handleToggle(w: AdminWorkspace) {
    await toggleMutation.mutateAsync({ id: w.id, is_active: !w.is_active })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Painel Super Admin</h1>
              <p className="text-sm text-gray-500">Gerencie todos os tenants da plataforma</p>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            title="Atualizar"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Total de tenants', value: workspaces.length, icon: Building2, color: 'text-indigo-600 bg-indigo-50' },
            { label: 'Ativos',           value: active,            icon: Power,     color: 'text-emerald-600 bg-emerald-50' },
            { label: 'Inativos',         value: inactive,          icon: PowerOff,  color: 'text-rose-600 bg-rose-50' },
            { label: 'Total de membros', value: members,           icon: Users,     color: 'text-blue-600 bg-blue-50' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-4">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${s.color}`}>
                <s.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                <p className="text-sm text-gray-500">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nome, slug ou e-mail do admin..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-200 p-6 animate-pulse">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gray-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">Nenhum tenant encontrado</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filtered.map(w => (
              <div
                key={w.id}
                className={`bg-white rounded-2xl border transition-all duration-200 hover:shadow-md ${
                  w.is_active ? 'border-gray-200 hover:border-indigo-200' : 'border-dashed border-gray-300 opacity-60'
                }`}
              >
                <div className="p-6">
                  {/* Avatar + Name */}
                  <div className="flex items-start gap-4 mb-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0 ${avatarColor(w.name)}`}>
                      {initials(w.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 truncate">{w.name}</h3>
                        {!w.is_active && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-500 font-medium flex-shrink-0">
                            Inativo
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 truncate">/{w.slug}</p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize flex-shrink-0 ${PLAN_COLORS[w.plan] ?? PLAN_COLORS.starter}`}>
                      {w.plan}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="space-y-2 mb-5">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Users className="w-3.5 h-3.5" />
                      <span>{w.member_count} {w.member_count === 1 ? 'membro' : 'membros'}</span>
                    </div>
                    {w.owner_email && (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Crown className="w-3.5 h-3.5" />
                        <span className="truncate">{w.owner_email}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{fmt(w.created_at)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-4 border-t border-gray-100">
                    <button
                      onClick={() => handleEnter(w)}
                      disabled={entering === w.id || !w.is_active}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium rounded-xl transition-colors"
                    >
                      {entering === w.id ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <LogIn className="w-4 h-4" />
                      )}
                      Entrar
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleToggle(w)}
                      disabled={toggleMutation.isPending}
                      title={w.is_active ? 'Desativar tenant' : 'Ativar tenant'}
                      className={`p-2.5 rounded-xl border transition-colors ${
                        w.is_active
                          ? 'border-gray-200 text-gray-400 hover:border-red-200 hover:text-red-500 hover:bg-red-50'
                          : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                      }`}
                    >
                      {w.is_active ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
