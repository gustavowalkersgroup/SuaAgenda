'use client'
import { useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner } from '@/components/ui/Spinner'
import { useServices, useCreateService, useUpdateService, useDeleteService } from '@/hooks/useServices'
import { useProfessionals } from '@/hooks/useProfessionals'
import { formatCurrency, cn } from '@/lib/utils'
import {
  Plus, Search, Pencil, Trash2, Clock, DollarSign,
  Scissors, Users, ToggleLeft, ToggleRight,
} from 'lucide-react'
import toast from 'react-hot-toast'

type Service = {
  id: string
  name: string
  description?: string
  durationMinutes: number
  price: number
  isActive: boolean
  professionals?: { id: string; name: string }[]
}

type ProfessionalOption = { id: string; name: string }

// ─── Form modal ────────────────────────────────────────────────────────────────
function ServiceForm({
  initial, professionals, onSave, onClose, loading,
}: {
  initial?: Partial<Service>
  professionals: ProfessionalOption[]
  onSave: (data: object) => void
  onClose: () => void
  loading: boolean
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    duration: initial?.durationMinutes ?? 30,
    price: initial?.price ?? 0,
    isActive: initial?.isActive ?? true,
    professionalIds: initial?.professionals?.map(p => p.id) ?? [] as string[],
  })

  function toggleProfessional(id: string) {
    setForm(f => ({
      ...f,
      professionalIds: f.professionalIds.includes(id)
        ? f.professionalIds.filter(x => x !== id)
        : [...f.professionalIds, id],
    }))
  }

  const durationOptions = [30, 45, 60, 90, 120, 150, 180]

  return (
    <div className="space-y-4">
      <Input label="Nome do serviço *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Corte masculino" />
      <Input label="Descrição" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descrição breve do serviço" />

      <div className="grid grid-cols-2 gap-3">
        {/* Duration */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1.5">Duração (minutos)</label>
          <div className="flex flex-wrap gap-2">
            {durationOptions.map(d => (
              <button
                key={d}
                type="button"
                onClick={() => setForm(f => ({ ...f, duration: d }))}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                  form.duration === d
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'border-gray-300 text-gray-600 hover:border-primary-400'
                )}
              >
                {d}min
              </button>
            ))}
          </div>
        </div>

        {/* Price */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1.5">Preço (R$)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">R$</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={form.price}
              onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))}
              className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      </div>

      {/* Professionals */}
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-2">Profissionais que realizam</label>
        {professionals.length === 0 ? (
          <p className="text-xs text-gray-400">Nenhum profissional cadastrado ainda</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {professionals.map(p => {
              const selected = form.professionalIds.includes(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleProfessional(p.id)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-all',
                    selected
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'border-gray-300 text-gray-600 hover:border-primary-400 bg-white'
                  )}
                >
                  <Avatar name={p.name} size="sm" className={cn('!w-5 !h-5 text-[10px]', selected && 'ring-2 ring-white/50')} />
                  {p.name}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Active toggle */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
        <div>
          <p className="text-sm font-medium text-gray-700">Serviço ativo</p>
          <p className="text-xs text-gray-400">Disponível para agendamento</p>
        </div>
        <button onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}>
          {form.isActive
            ? <ToggleRight size={28} className="text-primary-600" />
            : <ToggleLeft size={28} className="text-gray-400" />}
        </button>
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
        <Button
          className="flex-1"
          onClick={() => onSave(form)}
          loading={loading}
          disabled={!form.name || form.duration < 30}
        >
          {initial?.id ? 'Salvar alterações' : 'Criar serviço'}
        </Button>
      </div>
    </div>
  )
}

// ─── Service card ──────────────────────────────────────────────────────────────
function ServiceCard({
  service, onEdit, onDelete, onClick, active,
}: {
  service: Service
  onEdit: () => void
  onDelete: () => void
  onClick: () => void
  active: boolean
}) {
  return (
    <div
      className={cn(
        'bg-white rounded-xl border p-5 cursor-pointer transition-all hover:shadow-md hover:border-primary-200',
        active && 'border-primary-400 ring-1 ring-primary-300 shadow-md',
        !service.isActive && 'opacity-60'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 text-sm">{service.name}</h3>
            {!service.isActive && (
              <Badge className="bg-gray-100 text-gray-400">Inativo</Badge>
            )}
          </div>
          {service.description && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-2">{service.description}</p>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={e => { e.stopPropagation(); onEdit() }} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <Pencil size={13} />
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete() }} className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-50">
        <span className="flex items-center gap-1.5 text-sm text-gray-600">
          <Clock size={13} className="text-gray-400" />
          {service.durationMinutes}min
        </span>
        <span className="flex items-center gap-1.5 text-sm font-semibold text-primary-700">
          <DollarSign size={13} />
          {formatCurrency(service.price)}
        </span>
        {service.professionals && service.professionals.length > 0 && (
          <span className="ml-auto flex items-center gap-1 text-xs text-gray-400">
            <Users size={12} />
            {service.professionals.length} profissional{service.professionals.length !== 1 ? 'is' : ''}
          </span>
        )}
      </div>

      {/* Professionals avatars */}
      {service.professionals && service.professionals.length > 0 && (
        <div className="flex items-center gap-1 mt-2">
          {service.professionals.slice(0, 5).map(p => (
            <Avatar key={p.id} name={p.name} size="sm" className="!w-6 !h-6 text-[9px] ring-2 ring-white" />
          ))}
          {service.professionals.length > 5 && (
            <span className="text-xs text-gray-400 ml-1">+{service.professionals.length - 5}</span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function ServicesPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Service | null>(null)
  const [editing, setEditing] = useState<Service | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const { data, isLoading } = useServices({ search, page })
  const { data: profsData } = useProfessionals()
  const createService = useCreateService()
  const updateService = useUpdateService()
  const deleteService = useDeleteService()

  const services: Service[] = data?.data ?? []
  const total: number = data?.total ?? 0
  const professionals: ProfessionalOption[] = profsData?.data ?? []


  async function handleCreate(formData: { duration: number; [key: string]: unknown }) {
    try {
      const { duration, ...rest } = formData
      await createService.mutateAsync({ ...rest, durationMinutes: duration })
      toast.success('Serviço criado!')
      setShowCreate(false)
    } catch {
      toast.error('Erro ao criar serviço')
    }
  }

  async function handleUpdate(formData: { duration: number; [key: string]: unknown }) {
    if (!editing) return
    try {
      const { duration, ...rest } = formData
      await updateService.mutateAsync({ id: editing.id, ...rest, durationMinutes: duration })
      toast.success('Serviço atualizado!')
      setEditing(null)
    } catch {
      toast.error('Erro ao atualizar')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este serviço?')) return
    try {
      await deleteService.mutateAsync(id)
      toast.success('Removido')
      if (selected?.id === id) setSelected(null)
    } catch {
      toast.error('Erro ao remover')
    }
  }

  const totalRevenue = services.reduce((sum, s) => sum + s.price, 0)
  const avgDuration = services.length
    ? Math.round(services.reduce((sum, s) => sum + s.durationMinutes, 0) / services.length)
    : 0

  return (
    <AppLayout>
      <div className="p-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Serviços</h1>
            <p className="text-sm text-gray-500 mt-0.5">{total} serviço{total !== 1 ? 's' : ''} cadastrado{total !== 1 ? 's' : ''}</p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Novo serviço
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <div className="p-2 bg-primary-50 rounded-xl"><Scissors size={18} className="text-primary-600" /></div>
              <div>
                <p className="text-xs text-gray-500">Total de serviços</p>
                <p className="text-xl font-bold text-gray-900">{total}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <div className="p-2 bg-green-50 rounded-xl"><DollarSign size={18} className="text-green-600" /></div>
              <div>
                <p className="text-xs text-gray-500">Valor médio</p>
                <p className="text-xl font-bold text-gray-900">{formatCurrency(services.length ? totalRevenue / services.length : 0)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <div className="p-2 bg-blue-50 rounded-xl"><Clock size={18} className="text-blue-600" /></div>
              <div>
                <p className="text-xs text-gray-500">Duração média</p>
                <p className="text-xl font-bold text-gray-900">{avgDuration}min</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="mb-6">
          <Input
            placeholder="Buscar por nome ou categoria..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            leftIcon={<Search size={15} />}
            className="max-w-sm"
          />
        </div>

        {/* Grid */}
        {isLoading ? (
          <PageSpinner />
        ) : services.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <Scissors size={48} className="opacity-20 mb-4" />
            <p className="font-medium">Nenhum serviço cadastrado</p>
            <p className="text-sm mt-1">Crie seu primeiro serviço para começar a agendar</p>
            <Button className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus size={15} /> Criar primeiro serviço
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map(s => (
              <ServiceCard
                key={s.id}
                service={s}
                active={selected?.id === s.id}
                onClick={() => setSelected(s)}
                onEdit={() => setEditing(s)}
                onDelete={() => handleDelete(s.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Novo serviço" size="lg">
        <ServiceForm
          professionals={professionals}
          onSave={handleCreate}
          onClose={() => setShowCreate(false)}
          loading={createService.isPending}
        />
      </Modal>

      {/* Edit */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Editar serviço" size="lg">
        {editing && (
          <ServiceForm
            initial={editing}
            professionals={professionals}
            onSave={handleUpdate}
            onClose={() => setEditing(null)}
            loading={updateService.isPending}
          />
        )}
      </Modal>
    </AppLayout>
  )
}
