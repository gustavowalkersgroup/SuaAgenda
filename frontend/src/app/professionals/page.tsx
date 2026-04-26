'use client'
import { useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner } from '@/components/ui/Spinner'
import {
  useProfessionals, useCreateProfessional, useUpdateProfessional,
  useDeleteProfessional, useProfessionalSchedules, useUpdateSchedules,
  useAvailabilityBlocks, useCreateBlock, useDeleteBlock,
} from '@/hooks/useProfessionals'
import { useServices } from '@/hooks/useServices'
import { formatDate, formatCurrency, cn } from '@/lib/utils'
import {
  Plus, Search, Pencil, Trash2, Clock, CalendarOff,
  ChevronRight, Phone, Mail, Star, ToggleLeft, ToggleRight, ArrowLeft,
} from 'lucide-react'
import toast from 'react-hot-toast'

const DAYS = [
  { value: 0, label: 'Dom' }, { value: 1, label: 'Seg' }, { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' }, { value: 4, label: 'Qui' }, { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
]

const BLOCK_TYPES = {
  folga: { label: 'Folga', color: 'bg-red-100 text-red-700' },
  compromisso: { label: 'Compromisso', color: 'bg-orange-100 text-orange-700' },
  almoco_fixo: { label: 'Almoço fixo', color: 'bg-yellow-100 text-yellow-700' },
  almoco_dinamico: { label: 'Almoço dinâmico', color: 'bg-yellow-100 text-yellow-600' },
}

type Professional = {
  id: string
  name: string
  email?: string
  phone?: string
  specialty?: string
  isActive: boolean
  services?: { id: string; name: string; price: number }[]
}

type Schedule = {
  dayOfWeek: number
  startTime: string
  endTime: string
  isActive: boolean
}

type Block = {
  id: string
  type: string
  startAt: string
  endAt: string
  note?: string
}

const defaultSchedules: Schedule[] = DAYS.map(d => ({
  dayOfWeek: d.value,
  startTime: '08:00',
  endTime: '18:00',
  isActive: d.value >= 1 && d.value <= 5,
}))

// ─── Form modal ────────────────────────────────────────────────────────────────
function ProfessionalForm({
  initial, onSave, onClose, loading,
}: {
  initial?: Partial<Professional>
  onSave: (data: object) => void
  onClose: () => void
  loading: boolean
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    email: initial?.email ?? '',
    phone: initial?.phone ?? '',
    specialty: initial?.specialty ?? '',
    isActive: initial?.isActive ?? true,
  })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div className="space-y-4">
      <Input label="Nome *" value={form.name} onChange={set('name')} placeholder="Ex: Ana Paula" />
      <Input label="Especialidade" value={form.specialty} onChange={set('specialty')} placeholder="Ex: Cabeleireira" />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Telefone" value={form.phone} onChange={set('phone')} placeholder="11999999999" />
        <Input label="E-mail" type="email" value={form.email} onChange={set('email')} placeholder="ana@barbearia.com" />
      </div>
      <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
        <div>
          <p className="text-sm font-medium text-gray-700">Profissional ativo</p>
          <p className="text-xs text-gray-400">Aparece na agenda e agendamentos</p>
        </div>
        <button onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}>
          {form.isActive
            ? <ToggleRight size={28} className="text-primary-600" />
            : <ToggleLeft size={28} className="text-gray-400" />}
        </button>
      </div>
      <div className="flex gap-3 pt-2">
        <Button variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
        <Button className="flex-1" onClick={() => onSave(form)} loading={loading} disabled={!form.name}>
          {initial?.id ? 'Salvar alterações' : 'Criar profissional'}
        </Button>
      </div>
    </div>
  )
}

// ─── Schedules editor ──────────────────────────────────────────────────────────
function SchedulesEditor({ professionalId }: { professionalId: string }) {
  const { data, isLoading } = useProfessionalSchedules(professionalId)
  const updateSchedules = useUpdateSchedules()
  const [schedules, setSchedules] = useState<Schedule[]>(defaultSchedules)
  const [initialized, setInitialized] = useState(false)

  if (!initialized && data) {
    const loaded: Schedule[] = data.data ?? data
    if (loaded.length > 0) {
      setSchedules(
        DAYS.map(d => {
          const found = loaded.find((s: Schedule) => s.dayOfWeek === d.value)
          return found ?? { dayOfWeek: d.value, startTime: '08:00', endTime: '18:00', isActive: false }
        })
      )
    }
    setInitialized(true)
  }

  function updateDay(idx: number, field: keyof Schedule, value: string | boolean) {
    setSchedules(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  async function handleSave() {
    try {
      await updateSchedules.mutateAsync({ professionalId, schedules })
      toast.success('Horários salvos')
    } catch {
      toast.error('Erro ao salvar horários')
    }
  }

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-3">
      {schedules.map((s, i) => (
        <div
          key={s.dayOfWeek}
          className={cn(
            'flex items-center gap-3 p-3 rounded-xl border transition-colors',
            s.isActive ? 'border-primary-200 bg-primary-50/40' : 'border-gray-100 bg-gray-50 opacity-60'
          )}
        >
          <button
            onClick={() => updateDay(i, 'isActive', !s.isActive)}
            className="shrink-0"
          >
            {s.isActive
              ? <ToggleRight size={22} className="text-primary-600" />
              : <ToggleLeft size={22} className="text-gray-400" />}
          </button>
          <span className="w-8 text-sm font-semibold text-gray-700">{DAYS[i].label}</span>
          <div className="flex items-center gap-2 flex-1">
            <input
              type="time"
              value={s.startTime}
              disabled={!s.isActive}
              onChange={e => updateDay(i, 'startTime', e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 disabled:opacity-40"
            />
            <span className="text-gray-400 text-sm">às</span>
            <input
              type="time"
              value={s.endTime}
              disabled={!s.isActive}
              onChange={e => updateDay(i, 'endTime', e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 disabled:opacity-40"
            />
          </div>
        </div>
      ))}
      <Button onClick={handleSave} loading={updateSchedules.isPending} className="w-full mt-2">
        Salvar horários
      </Button>
    </div>
  )
}

// ─── Blocks editor ─────────────────────────────────────────────────────────────
function BlocksEditor({ professionalId }: { professionalId: string }) {
  const { data, isLoading } = useAvailabilityBlocks(professionalId)
  const createBlock = useCreateBlock()
  const deleteBlock = useDeleteBlock()
  const [form, setForm] = useState({
    type: 'folga', startAt: '', endAt: '', note: '',
  })

  const blocks: Block[] = data?.data ?? data ?? []

  async function handleCreate() {
    if (!form.startAt || !form.endAt) return
    try {
      await createBlock.mutateAsync({ professionalId, ...form })
      setForm({ type: 'folga', startAt: '', endAt: '', note: '' })
      toast.success('Bloqueio criado')
    } catch {
      toast.error('Erro ao criar bloqueio')
    }
  }

  async function handleDelete(blockId: string) {
    try {
      await deleteBlock.mutateAsync({ professionalId, blockId })
      toast.success('Bloqueio removido')
    } catch {
      toast.error('Erro ao remover')
    }
  }

  return (
    <div className="space-y-4">
      {/* Create form */}
      <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-3">
        <p className="text-sm font-semibold text-gray-700">Novo bloqueio</p>
        <Select
          label="Tipo"
          value={form.type}
          onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
        >
          {Object.entries(BLOCK_TYPES).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Início" type="datetime-local" value={form.startAt} onChange={e => setForm(f => ({ ...f, startAt: e.target.value }))} />
          <Input label="Fim" type="datetime-local" value={form.endAt} onChange={e => setForm(f => ({ ...f, endAt: e.target.value }))} />
        </div>
        <Input label="Observação" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Opcional" />
        <Button onClick={handleCreate} loading={createBlock.isPending} disabled={!form.startAt || !form.endAt} size="sm">
          <Plus size={14} /> Adicionar bloqueio
        </Button>
      </div>

      {/* List */}
      {isLoading ? <PageSpinner /> : blocks.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">Nenhum bloqueio cadastrado</p>
      ) : (
        <div className="space-y-2">
          {blocks.map(b => {
            const bt = BLOCK_TYPES[b.type as keyof typeof BLOCK_TYPES]
            return (
              <div key={b.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-white">
                <div className="flex items-center gap-3">
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', bt?.color ?? 'bg-gray-100 text-gray-600')}>
                    {bt?.label ?? b.type}
                  </span>
                  <div>
                    <p className="text-sm text-gray-700">
                      {formatDate(b.startAt, 'dd/MM/yyyy HH:mm')} → {formatDate(b.endAt, 'dd/MM/yyyy HH:mm')}
                    </p>
                    {b.note && <p className="text-xs text-gray-400">{b.note}</p>}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(b.id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Detail panel ──────────────────────────────────────────────────────────────
function ProfessionalDetail({
  professional, onEdit, onClose,
}: { professional: Professional; onEdit: () => void; onClose: () => void }) {
  const [tab, setTab] = useState<'schedules' | 'blocks' | 'services'>('schedules')

  return (
    <div className="space-y-5">
      {/* Back button — mobile only */}
      <button
        onClick={onClose}
        className="flex items-center gap-2 text-sm text-primary-600 font-medium md:hidden mb-1"
      >
        <ArrowLeft size={16} /> Voltar à lista
      </button>

      {/* Header */}
      <div className="flex items-start gap-4">
        <Avatar name={professional.name} size="lg" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-900">{professional.name}</h2>
            <Badge className={professional.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
              {professional.isActive ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>
          {professional.specialty && (
            <p className="text-sm text-primary-600 font-medium mt-0.5">{professional.specialty}</p>
          )}
          <div className="flex flex-wrap gap-3 mt-2">
            {professional.phone && (
              <span className="flex items-center gap-1 text-xs text-gray-500"><Phone size={11} />{professional.phone}</span>
            )}
            {professional.email && (
              <span className="flex items-center gap-1 text-xs text-gray-500"><Mail size={11} />{professional.email}</span>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil size={14} /> Editar
        </Button>
      </div>

      {/* Services linked */}
      {professional.services && professional.services.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {professional.services.map(s => (
            <span key={s.id} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary-50 text-primary-700 text-xs font-medium">
              <Star size={10} /> {s.name} — {formatCurrency(s.price)}
            </span>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
        {(['schedules', 'blocks', 'services'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 py-2 text-sm font-medium rounded-md transition-colors',
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {t === 'schedules' ? '🕐 Horários' : t === 'blocks' ? '🚫 Bloqueios' : '✂️ Serviços'}
          </button>
        ))}
      </div>

      {tab === 'schedules' && <SchedulesEditor professionalId={professional.id} />}
      {tab === 'blocks' && <BlocksEditor professionalId={professional.id} />}
      {tab === 'services' && (
        <div>
          {!professional.services?.length ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Nenhum serviço vinculado. Vincule na página de Serviços.
            </p>
          ) : (
            <div className="space-y-2">
              {professional.services.map(s => (
                <div key={s.id} className="flex justify-between items-center p-3 rounded-lg bg-gray-50 text-sm">
                  <span className="font-medium text-gray-800">{s.name}</span>
                  <span className="text-primary-600 font-semibold">{formatCurrency(s.price)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function ProfessionalsPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Professional | null>(null)
  const [editing, setEditing] = useState<Professional | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const { data, isLoading } = useProfessionals({ search, page })
  const createProfessional = useCreateProfessional()
  const updateProfessional = useUpdateProfessional()
  const deleteProfessional = useDeleteProfessional()

  const professionals: Professional[] = data?.data ?? []
  const total: number = data?.total ?? 0

  async function handleCreate(formData: object) {
    try {
      await createProfessional.mutateAsync(formData)
      toast.success('Profissional criado!')
      setShowCreate(false)
    } catch {
      toast.error('Erro ao criar profissional')
    }
  }

  async function handleUpdate(formData: object) {
    if (!editing) return
    try {
      await updateProfessional.mutateAsync({ id: editing.id, ...formData })
      toast.success('Profissional atualizado!')
      setEditing(null)
      if (selected?.id === editing.id) setSelected({ ...selected, ...formData as Partial<Professional> })
    } catch {
      toast.error('Erro ao atualizar')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este profissional?')) return
    try {
      await deleteProfessional.mutateAsync(id)
      toast.success('Removido')
      if (selected?.id === id) setSelected(null)
    } catch {
      toast.error('Erro ao remover')
    }
  }

  return (
    <AppLayout>
      <div className="flex h-screen overflow-hidden">
        {/* List panel — hidden on mobile when detail is open */}
        <div className={cn(
          'flex flex-col border-r border-gray-200 bg-white transition-all',
          selected ? 'hidden md:flex md:w-80' : 'flex flex-1'
        )}>
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-xl font-bold text-gray-900">Profissionais</h1>
                <p className="text-xs text-gray-400 mt-0.5">{total} cadastrado{total !== 1 ? 's' : ''}</p>
              </div>
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus size={15} /> Novo
              </Button>
            </div>
            <Input
              placeholder="Buscar profissional..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              leftIcon={<Search size={14} />}
            />
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {isLoading ? <PageSpinner /> : professionals.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2 py-16">
                <Star size={36} className="opacity-20" />
                <p className="text-sm">Nenhum profissional encontrado</p>
              </div>
            ) : (
              professionals.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelected(p)}
                  className={cn(
                    'w-full flex items-center gap-3 px-5 py-4 border-b border-gray-50 hover:bg-gray-50 transition-colors text-left',
                    selected?.id === p.id && 'bg-primary-50 border-l-2 border-l-primary-500'
                  )}
                >
                  <Avatar name={p.name} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                      {!p.isActive && <span className="text-xs text-gray-400">(inativo)</span>}
                    </div>
                    {p.specialty && <p className="text-xs text-primary-600 truncate">{p.specialty}</p>}
                    {p.services && p.services.length > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">{p.services.length} serviço{p.services.length !== 1 ? 's' : ''}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); setEditing(p) }}
                      className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(p.id) }}
                      className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 size={13} />
                    </button>
                    <ChevronRight size={14} className="text-gray-300" />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Detail panel — full-width on mobile, flex-1 on desktop */}
        {selected && (
          <div className="flex-1 overflow-y-auto scrollbar-thin bg-gray-50">
            <div className="max-w-2xl mx-auto p-4 md:p-8">
              <ProfessionalDetail
                professional={selected}
                onEdit={() => setEditing(selected)}
                onClose={() => setSelected(null)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Novo profissional">
        <ProfessionalForm
          onSave={handleCreate}
          onClose={() => setShowCreate(false)}
          loading={createProfessional.isPending}
        />
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Editar profissional">
        {editing && (
          <ProfessionalForm
            initial={editing}
            onSave={handleUpdate}
            onClose={() => setEditing(null)}
            loading={updateProfessional.isPending}
          />
        )}
      </Modal>
    </AppLayout>
  )
}
