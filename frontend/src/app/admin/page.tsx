'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2, Users, Calendar, Search, LogIn, Power, PowerOff,
  Shield, ChevronRight, RefreshCw, Crown, X, Copy, Check,
  Trash2, Download, UserMinus, Mail, Clock, Hash,
  ToggleLeft, ToggleRight, Save, UserPlus,
} from 'lucide-react'
import {
  useAdminWorkspaces, useWorkspaceDetail, useEnterWorkspace, useUpdateWorkspace,
  useDeleteWorkspace, useRemoveMember, usePromoteUser,
  AdminWorkspace, WorkspaceMember,
} from '@/hooks/useAdmin'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import toast from 'react-hot-toast'

const PLAN_OPTIONS = ['starter', 'pro', 'enterprise', 'trial'] as const
const PLAN_COLORS: Record<string, string> = {
  starter:    'bg-slate-100 text-slate-600',
  pro:        'bg-blue-100 text-blue-700',
  enterprise: 'bg-purple-100 text-purple-700',
  trial:      'bg-amber-100 text-amber-700',
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

function fmt(date: string | null | undefined) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function toInputDate(iso: string | null | undefined) {
  if (!iso) return ''
  return iso.slice(0, 10)
}

// ─── Copy button ──────────────────────────────────────────────────────────────
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="ml-1 p-0.5 rounded text-gray-400 hover:text-gray-600 transition-colors"
      title="Copiar"
    >
      {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
    </button>
  )
}

// ─── Workspace Detail Drawer ──────────────────────────────────────────────────
function WorkspaceDrawer({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const { data, isLoading } = useWorkspaceDetail(workspaceId)
  const updateMutation = useUpdateWorkspace()
  const deleteMutation = useDeleteWorkspace()
  const removeMemberMutation = useRemoveMember()

  const [plan, setPlan] = useState('')
  const [trialDate, setTrialDate] = useState('')
  const [maxContacts, setMaxContacts] = useState(0)
  const [maxUsers, setMaxUsers] = useState(0)
  const [billingEmail, setBillingEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [initialized, setInitialized] = useState(false)
  const [promoteEmail, setPromoteEmail] = useState('')
  const promoteMutation = usePromoteUser()

  if (data && !initialized) {
    setPlan(data.plan)
    setTrialDate(toInputDate(data.trial_ends_at))
    setMaxContacts(data.max_contacts)
    setMaxUsers(data.max_users)
    setBillingEmail(data.billing_email ?? '')
    setNotes(data.notes ?? '')
    setIsActive(data.is_active)
    setInitialized(true)
  }

  async function handleSave() {
    await updateMutation.mutateAsync({
      id: workspaceId,
      plan,
      trial_ends_at: trialDate || null,
      max_contacts: maxContacts,
      max_users: maxUsers,
      billing_email: billingEmail || undefined,
      notes,
      is_active: isActive,
    })
    toast.success('Workspace atualizado')
  }

  async function handleDelete() {
    if (!confirm(`Desativar permanentemente o workspace "${data?.name}"? Esta ação pode ser revertida manualmente no banco.`)) return
    await deleteMutation.mutateAsync(workspaceId)
    toast.success('Workspace desativado')
    onClose()
  }

  async function handleExport() {
    try {
      const res = await api.get(`/admin/workspaces/${workspaceId}/export`)
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `workspace-${data?.slug ?? workspaceId}-backup.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Backup exportado')
    } catch {
      toast.error('Erro ao exportar')
    }
  }

  async function handleRemoveMember(member: WorkspaceMember) {
    if (!confirm(`Remover ${member.name} do workspace?`)) return
    await removeMemberMutation.mutateAsync({ workspaceId, userId: member.user_id })
    toast.success('Membro removido')
  }

  async function handlePromote() {
    if (!promoteEmail) return
    await promoteMutation.mutateAsync(promoteEmail)
    toast.success(`${promoteEmail} promovido a super-admin`)
    setPromoteEmail('')
  }

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" />

      {/* Panel */}
      <div
        className="w-[480px] bg-white h-full overflow-y-auto shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            {data && (
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm ${avatarColor(data.name)}`}>
                {initials(data.name)}
              </div>
            )}
            <div>
              <h2 className="font-semibold text-gray-900 text-base">{data?.name ?? '...'}</h2>
              <p className="text-xs text-gray-400">/{data?.slug}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <RefreshCw size={20} className="animate-spin text-gray-400" />
          </div>
        ) : data ? (
          <div className="flex-1 px-6 py-5 space-y-6">
            {/* IDs */}
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Identificação</h3>
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 flex items-center gap-1.5"><Hash size={12} /> Tenant ID</span>
                  <span className="font-mono text-xs text-gray-700 flex items-center">
                    {data.id.slice(0, 8)}…
                    <CopyButton value={data.id} />
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 flex items-center gap-1.5"><Calendar size={12} /> Criado em</span>
                  <span className="text-gray-700">{fmt(data.created_at)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 flex items-center gap-1.5"><Crown size={12} /> Proprietário</span>
                  <span className="text-gray-700 truncate max-w-[200px]">{data.owner_email ?? '—'}</span>
                </div>
              </div>
            </section>

            {/* Status & Plan */}
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Plano & Status</h3>
              <div className="space-y-3">
                {/* Active toggle */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-gray-200">
                  <span className="text-sm font-medium text-gray-700">Workspace ativo</span>
                  <button onClick={() => setIsActive(v => !v)}>
                    {isActive
                      ? <ToggleRight size={26} className="text-primary-600" />
                      : <ToggleLeft size={26} className="text-gray-400" />}
                  </button>
                </div>

                {/* Plan */}
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Plano</label>
                  <div className="flex gap-2 flex-wrap">
                    {PLAN_OPTIONS.map(p => (
                      <button
                        key={p}
                        onClick={() => { setPlan(p); if (p !== 'trial') setTrialDate('') }}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                          plan === p
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Trial end date */}
                {plan === 'trial' && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">
                      <Clock size={11} className="inline mr-1" />
                      Expiração do trial
                    </label>
                    <input
                      type="date"
                      value={trialDate}
                      onChange={e => setTrialDate(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                )}
                {data.trial_ends_at && plan !== 'trial' && (
                  <p className="text-xs text-amber-600">
                    Trial anterior expira em {fmt(data.trial_ends_at)}
                  </p>
                )}
              </div>
            </section>

            {/* Limits */}
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Limites</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Máx. contatos</label>
                  <input
                    type="number" min={1}
                    value={maxContacts}
                    onChange={e => setMaxContacts(Number(e.target.value))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Máx. usuários</label>
                  <input
                    type="number" min={1}
                    value={maxUsers}
                    onChange={e => setMaxUsers(Number(e.target.value))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </section>

            {/* Billing */}
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Faturamento</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">
                    <Mail size={11} className="inline mr-1" />
                    E-mail de cobrança
                  </label>
                  <input
                    type="email"
                    value={billingEmail}
                    onChange={e => setBillingEmail(e.target.value)}
                    placeholder="financeiro@empresa.com"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Observações internas</label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Anotações sobre o cliente..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>
              </div>
            </section>

            {/* Save */}
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
            >
              {updateMutation.isPending ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
              Salvar alterações
            </button>

            {/* Members */}
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Membros ({data.members?.length ?? 0})
              </h3>
              <div className="space-y-2">
                {(data.members ?? []).map(m => (
                  <div key={m.user_id} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50">
                    <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {initials(m.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{m.name}</p>
                      <p className="text-xs text-gray-400 truncate">{m.email} · {m.role}</p>
                    </div>
                    <button
                      onClick={() => handleRemoveMember(m)}
                      className="p-1.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Remover do workspace"
                    >
                      <UserMinus size={13} />
                    </button>
                  </div>
                ))}
                {(data.members ?? []).length === 0 && (
                  <p className="text-xs text-gray-400">Nenhum membro ativo</p>
                )}
              </div>
            </section>

            {/* Promote to super-admin */}
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                <UserPlus size={11} className="inline mr-1" />
                Promover a Super-Admin
              </h3>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={promoteEmail}
                  onChange={e => setPromoteEmail(e.target.value)}
                  placeholder="email@usuario.com"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={handlePromote}
                  disabled={!promoteEmail || promoteMutation.isPending}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Promover
                </button>
              </div>
            </section>

            {/* Danger zone */}
            <section className="border border-red-200 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-semibold text-red-500 uppercase tracking-wider">Zona de perigo</h3>

              <button
                onClick={handleExport}
                className="w-full flex items-center justify-center gap-2 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Download size={14} /> Exportar backup (JSON)
              </button>

              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="w-full flex items-center justify-center gap-2 py-2 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
              >
                {deleteMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Desativar workspace
              </button>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [entering, setEntering] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [planFilter, setPlanFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  const { data: workspaces = [], isLoading, refetch } = useAdminWorkspaces()
  const enterMutation = useEnterWorkspace()

  const filtered = workspaces.filter(w => {
    const matchSearch =
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.slug.toLowerCase().includes(search.toLowerCase()) ||
      (w.owner_email ?? '').toLowerCase().includes(search.toLowerCase())
    const matchPlan = planFilter === 'all' || w.plan === planFilter
    const matchStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && w.is_active) ||
      (statusFilter === 'inactive' && !w.is_active)
    return matchSearch && matchPlan && matchStatus
  })

  const active   = workspaces.filter(w => w.is_active).length
  const inactive = workspaces.filter(w => !w.is_active).length
  const members  = workspaces.reduce((s, w) => s + w.member_count, 0)
  const trials   = workspaces.filter(w => w.plan === 'trial').length

  async function handleEnter(workspace: AdminWorkspace) {
    setEntering(workspace.id)
    try {
      const result = await enterMutation.mutateAsync(workspace.id)
      const currentToken = localStorage.getItem('token')
      if (currentToken) localStorage.setItem('sa_token', currentToken)
      localStorage.setItem('token', result.token)
      qc.clear()
      router.push('/dashboard')
    } finally {
      setEntering(null)
    }
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

      <div className="max-w-7xl mx-auto px-8 py-8 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Total de tenants', value: workspaces.length, icon: Building2, color: 'text-indigo-600 bg-indigo-50', filter: 'all' },
            { label: 'Ativos',           value: active,            icon: Power,     color: 'text-emerald-600 bg-emerald-50', filter: 'active' },
            { label: 'Inativos',         value: inactive,          icon: PowerOff,  color: 'text-rose-600 bg-rose-50', filter: 'inactive' },
            { label: 'Total de membros', value: members,           icon: Users,     color: 'text-blue-600 bg-blue-50', filter: null },
          ].map(s => (
            <button
              key={s.label}
              onClick={() => s.filter !== null && setStatusFilter(s.filter as typeof statusFilter)}
              className={`bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-4 text-left transition-all ${
                s.filter && statusFilter === s.filter ? 'ring-2 ring-indigo-400 border-indigo-200' : 'hover:shadow-sm'
              }`}
            >
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${s.color}`}>
                <s.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                <p className="text-sm text-gray-500">{s.label}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3 items-center flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome, slug ou e-mail..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Plan filter */}
          <div className="flex gap-1">
            {(['all', ...PLAN_OPTIONS] as const).map(p => (
              <button
                key={p}
                onClick={() => setPlanFilter(p)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  planFilter === p
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                {p === 'all' ? 'Todos' : p.charAt(0).toUpperCase() + p.slice(1)}
                {p === 'trial' && trials > 0 && (
                  <span className="ml-1 bg-amber-400 text-white rounded-full px-1 text-[10px]">{trials}</span>
                )}
              </button>
            ))}
          </div>
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
                className={`bg-white rounded-2xl border transition-all duration-200 hover:shadow-md cursor-pointer ${
                  w.is_active ? 'border-gray-200 hover:border-indigo-200' : 'border-dashed border-gray-300 opacity-60'
                } ${detailId === w.id ? 'ring-2 ring-indigo-400' : ''}`}
                onClick={() => setDetailId(w.id)}
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
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-500 font-medium flex-shrink-0">Inativo</span>
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
                      <span className="text-gray-300">·</span>
                      <span>{w.max_contacts.toLocaleString('pt-BR')} contatos</span>
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
                      {w.trial_ends_at && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span className="text-amber-600 font-medium">Trial até {fmt(w.trial_ends_at)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-4 border-t border-gray-100" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => handleEnter(w)}
                      disabled={entering === w.id || !w.is_active}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium rounded-xl transition-colors"
                    >
                      {entering === w.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                      Entrar
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDetailId(w.id)}
                      title="Configurações do tenant"
                      className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:border-indigo-200 hover:text-indigo-500 hover:bg-indigo-50 transition-colors"
                    >
                      <Shield className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {detailId && (
        <WorkspaceDrawer
          workspaceId={detailId}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  )
}
