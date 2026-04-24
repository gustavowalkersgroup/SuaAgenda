'use client'
import { useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner } from '@/components/ui/Spinner'
import {
  useBroadcasts, useCreateBroadcast, useStartBroadcast,
  useCancelBroadcast, useDeleteBroadcast,
} from '@/hooks/useBroadcasts'
import { formatDate, formatRelative, cn } from '@/lib/utils'
import {
  Plus, Megaphone, Play, Square, Trash2, ChevronRight,
  Users, Send, Clock, CheckCircle, XCircle, AlertCircle,
  BarChart2, RefreshCw, Eye,
} from 'lucide-react'
import toast from 'react-hot-toast'

type Broadcast = {
  id: string
  name: string
  status: 'rascunho' | 'enviando' | 'concluido' | 'cancelado'
  speed: number
  segmentType: string
  segmentValue?: string
  messages: string[]
  scheduledAt?: string
  startedAt?: string
  completedAt?: string
  totalRecipients: number
  sentCount: number
  failedCount: number
  createdAt: string
}

const STATUS_MAP = {
  rascunho: { label: 'Rascunho', color: 'bg-gray-100 text-gray-600', icon: Clock },
  enviando: { label: 'Enviando...', color: 'bg-blue-100 text-blue-700', icon: RefreshCw },
  concluido: { label: 'Concluído', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-600', icon: XCircle },
}

const SPEED_OPTIONS = [
  { value: 1, label: '1 msg/min — ultra seguro' },
  { value: 5, label: '5 msg/min — seguro' },
  { value: 10, label: '10 msg/min — moderado' },
]

const SEGMENT_TYPES = [
  { value: 'all', label: 'Todos os contatos' },
  { value: 'status', label: 'Por status (ativo, lead...)' },
  { value: 'tag', label: 'Por tag' },
  { value: 'inactive', label: 'Contatos inativos (X dias)' },
]

// ─── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className={cn('h-1.5 bg-gray-100 rounded-full overflow-hidden', className)}>
      <div
        className="h-full bg-primary-500 rounded-full transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ─── Create form ───────────────────────────────────────────────────────────────
function BroadcastForm({ onSave, onClose, loading }: {
  onSave: (data: object) => void
  onClose: () => void
  loading: boolean
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [form, setForm] = useState({
    name: '',
    segmentType: 'all',
    segmentValue: '',
    speed: 5,
    messages: [''],
    scheduledAt: '',
  })

  function addMessage() {
    if (form.messages.length >= 4) return
    setForm(f => ({ ...f, messages: [...f.messages, ''] }))
  }

  function updateMessage(idx: number, val: string) {
    setForm(f => ({ ...f, messages: f.messages.map((m, i) => i === idx ? val : m) }))
  }

  function removeMessage(idx: number) {
    if (form.messages.length <= 1) return
    setForm(f => ({ ...f, messages: f.messages.filter((_, i) => i !== idx) }))
  }

  const canNext1 = form.name && (form.segmentType !== 'status' || form.segmentValue) && (form.segmentType !== 'tag' || form.segmentValue) && (form.segmentType !== 'inactive' || form.segmentValue)
  const canNext2 = form.messages.some(m => m.trim().length > 0)

  return (
    <div className="space-y-5">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
              step >= s ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-400'
            )}>
              {s}
            </div>
            {s < 3 && <div className={cn('h-px w-10 transition-colors', step > s ? 'bg-primary-400' : 'bg-gray-200')} />}
          </div>
        ))}
        <span className="text-sm text-gray-500 ml-2">
          {step === 1 ? 'Segmento' : step === 2 ? 'Mensagens' : 'Configurar e revisar'}
        </span>
      </div>

      {/* Step 1: Segment */}
      {step === 1 && (
        <div className="space-y-4">
          <Input
            label="Nome da campanha *"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Ex: Promoção de aniversário"
          />
          <Select
            label="Segmento de envio"
            value={form.segmentType}
            onChange={e => setForm(f => ({ ...f, segmentType: e.target.value, segmentValue: '' }))}
          >
            {SEGMENT_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
          {form.segmentType === 'status' && (
            <Select
              label="Status do contato"
              value={form.segmentValue}
              onChange={e => setForm(f => ({ ...f, segmentValue: e.target.value }))}
            >
              <option value="">Selecione...</option>
              <option value="lead">Lead</option>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </Select>
          )}
          {form.segmentType === 'tag' && (
            <Input
              label="Nome da tag"
              value={form.segmentValue}
              onChange={e => setForm(f => ({ ...f, segmentValue: e.target.value }))}
              placeholder="Ex: vip, aniversariante..."
            />
          )}
          {form.segmentType === 'inactive' && (
            <Input
              label="Inativo há X dias"
              type="number"
              min={1}
              value={form.segmentValue}
              onChange={e => setForm(f => ({ ...f, segmentValue: e.target.value }))}
              placeholder="Ex: 30"
            />
          )}
        </div>
      )}

      {/* Step 2: Messages */}
      {step === 2 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Variações de mensagem</p>
              <p className="text-xs text-gray-400 mt-0.5">Até 4 variações — o sistema sorteia uma por envio (anti-ban)</p>
            </div>
            {form.messages.length < 4 && (
              <Button variant="outline" size="sm" onClick={addMessage}>
                <Plus size={13} /> Adicionar variação
              </Button>
            )}
          </div>

          {form.messages.map((msg, idx) => (
            <div key={idx} className="relative">
              <div className="flex items-start gap-2">
                <span className="mt-2 w-5 h-5 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>
                <div className="flex-1">
                  <textarea
                    value={msg}
                    onChange={e => updateMessage(idx, e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                    rows={3}
                    placeholder={`Variação ${idx + 1}. Use {{nome}}, {{primeiro_nome}}, {{telefone}}`}
                  />
                  <div className="flex justify-between items-center mt-1 px-1">
                    <p className="text-xs text-gray-400">{msg.length} caracteres</p>
                    {form.messages.length > 1 && (
                      <button onClick={() => removeMessage(idx)} className="text-xs text-red-400 hover:text-red-600">
                        Remover
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 mt-2">
            <strong>Dica anti-ban:</strong> use variações diferentes para cada segmento, evite links externos e palavras como "promoção", "grátis", "clique aqui".
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Velocidade de envio</label>
            <div className="space-y-2">
              {SPEED_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setForm(f => ({ ...f, speed: opt.value }))}
                  className={cn(
                    'w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm transition-colors',
                    form.speed === opt.value
                      ? 'border-primary-400 bg-primary-50 text-primary-800'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  )}
                >
                  <span>{opt.label}</span>
                  {form.speed === opt.value && <CheckCircle size={16} className="text-primary-600" />}
                </button>
              ))}
            </div>
          </div>

          <Input
            label="Agendamento (opcional)"
            type="datetime-local"
            value={form.scheduledAt}
            onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))}
          />

          {/* Summary */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm border border-gray-200">
            <p className="font-semibold text-gray-800 text-base mb-3">Resumo da campanha</p>
            <div className="flex justify-between">
              <span className="text-gray-500">Nome</span>
              <span className="font-medium text-gray-800">{form.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Segmento</span>
              <span className="font-medium text-gray-800">
                {SEGMENT_TYPES.find(s => s.value === form.segmentType)?.label}
                {form.segmentValue && ` — ${form.segmentValue}`}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Variações</span>
              <span className="font-medium text-gray-800">{form.messages.filter(m => m.trim()).length} mensagem{form.messages.filter(m => m.trim()).length !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Velocidade</span>
              <span className="font-medium text-gray-800">{form.speed} msg/min</span>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3 pt-2 border-t border-gray-100">
        {step > 1 && (
          <Button variant="secondary" onClick={() => setStep(s => (s - 1) as 1 | 2 | 3)}>
            Voltar
          </Button>
        )}
        <Button
          variant="secondary"
          className="flex-none"
          onClick={onClose}
        >
          Cancelar
        </Button>
        <div className="flex-1" />
        {step < 3 ? (
          <Button
            onClick={() => setStep(s => (s + 1) as 2 | 3)}
            disabled={step === 1 ? !canNext1 : !canNext2}
          >
            Próximo <ChevronRight size={15} />
          </Button>
        ) : (
          <Button onClick={() => onSave(form)} loading={loading}>
            <Megaphone size={15} /> Criar campanha
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Broadcast card ────────────────────────────────────────────────────────────
function BroadcastCard({
  broadcast, onStart, onCancel, onDelete, onView,
  startLoading, cancelLoading,
}: {
  broadcast: Broadcast
  onStart: () => void
  onCancel: () => void
  onDelete: () => void
  onView: () => void
  startLoading: boolean
  cancelLoading: boolean
}) {
  const s = STATUS_MAP[broadcast.status]
  const Icon = s.icon
  const pct = broadcast.totalRecipients > 0
    ? Math.round((broadcast.sentCount / broadcast.totalRecipients) * 100)
    : 0

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="py-5">
        <div className="flex items-start gap-4">
          <div className={cn('p-2.5 rounded-xl shrink-0', broadcast.status === 'enviando' ? 'bg-blue-50' : broadcast.status === 'concluido' ? 'bg-green-50' : 'bg-gray-100')}>
            <Megaphone size={20} className={broadcast.status === 'enviando' ? 'text-blue-600' : broadcast.status === 'concluido' ? 'text-green-600' : 'text-gray-500'} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900">{broadcast.name}</h3>
              <Badge className={s.color}>
                <span className="flex items-center gap-1">
                  <Icon size={11} className={broadcast.status === 'enviando' ? 'animate-spin' : ''} />
                  {s.label}
                </span>
              </Badge>
            </div>

            <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Users size={11} />
                {broadcast.totalRecipients > 0 ? `${broadcast.totalRecipients} destinatários` : 'Calculando...'}
              </span>
              <span className="flex items-center gap-1">
                <Send size={11} />
                {broadcast.sentCount} enviados
              </span>
              {broadcast.failedCount > 0 && (
                <span className="flex items-center gap-1 text-red-400">
                  <AlertCircle size={11} />
                  {broadcast.failedCount} falhas
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock size={11} />
                {broadcast.speed} msg/min
              </span>
            </div>

            {/* Progress */}
            {broadcast.totalRecipients > 0 && (
              <div className="mt-3">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Progresso</span>
                  <span className="font-medium text-gray-600">{pct}%</span>
                </div>
                <ProgressBar value={broadcast.sentCount} max={broadcast.totalRecipients} />
              </div>
            )}

            <p className="text-xs text-gray-400 mt-2">{formatRelative(broadcast.createdAt)}</p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-1.5 shrink-0">
            {broadcast.status === 'rascunho' && (
              <Button size="sm" onClick={onStart} loading={startLoading}>
                <Play size={13} /> Disparar
              </Button>
            )}
            {broadcast.status === 'enviando' && (
              <Button size="sm" variant="danger" onClick={onCancel} loading={cancelLoading}>
                <Square size={13} /> Pausar
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onView}>
              <Eye size={13} /> Ver
            </Button>
            {(broadcast.status === 'rascunho' || broadcast.status === 'cancelado') && (
              <button
                onClick={onDelete}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Detail modal ──────────────────────────────────────────────────────────────
function BroadcastDetail({ broadcast }: { broadcast: Broadcast }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Total de destinatários</p>
          <p className="text-2xl font-bold text-gray-900">{broadcast.totalRecipients}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Enviados com sucesso</p>
          <p className="text-2xl font-bold text-green-700">{broadcast.sentCount}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Falhas</p>
          <p className="text-2xl font-bold text-red-600">{broadcast.failedCount}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Taxa de entrega</p>
          <p className="text-2xl font-bold text-blue-700">
            {broadcast.totalRecipients > 0
              ? `${Math.round(((broadcast.sentCount) / broadcast.totalRecipients) * 100)}%`
              : '—'}
          </p>
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2">Mensagens cadastradas</p>
        <div className="space-y-2">
          {broadcast.messages.map((msg, i) => (
            <div key={i} className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-700 border-l-2 border-primary-400">
              <span className="text-xs text-primary-500 font-medium block mb-1">Variação {i + 1}</span>
              {msg}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        {broadcast.createdAt && (
          <div><p className="text-xs text-gray-400">Criado em</p><p className="font-medium">{formatDate(broadcast.createdAt)}</p></div>
        )}
        {broadcast.startedAt && (
          <div><p className="text-xs text-gray-400">Iniciado em</p><p className="font-medium">{formatDate(broadcast.startedAt)}</p></div>
        )}
        {broadcast.completedAt && (
          <div><p className="text-xs text-gray-400">Concluído em</p><p className="font-medium">{formatDate(broadcast.completedAt)}</p></div>
        )}
      </div>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function BroadcastsPage() {
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [viewing, setViewing] = useState<Broadcast | null>(null)

  const { data, isLoading } = useBroadcasts({ page })
  const createBroadcast = useCreateBroadcast()
  const startBroadcast = useStartBroadcast()
  const cancelBroadcast = useCancelBroadcast()
  const deleteBroadcast = useDeleteBroadcast()

  const broadcasts: Broadcast[] = data?.data ?? []
  const total: number = data?.total ?? 0

  const stats = {
    total,
    active: broadcasts.filter(b => b.status === 'enviando').length,
    completed: broadcasts.filter(b => b.status === 'concluido').length,
    totalSent: broadcasts.reduce((sum, b) => sum + b.sentCount, 0),
  }

  async function handleCreate(formData: object) {
    try {
      await createBroadcast.mutateAsync(formData)
      toast.success('Campanha criada!')
      setShowCreate(false)
    } catch {
      toast.error('Erro ao criar campanha')
    }
  }

  async function handleStart(id: string) {
    try {
      await startBroadcast.mutateAsync(id)
      toast.success('Campanha iniciada!')
    } catch {
      toast.error('Erro ao iniciar campanha')
    }
  }

  async function handleCancel(id: string) {
    try {
      await cancelBroadcast.mutateAsync(id)
      toast.success('Campanha pausada')
    } catch {
      toast.error('Erro ao cancelar')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover esta campanha?')) return
    try {
      await deleteBroadcast.mutateAsync(id)
      toast.success('Removida')
    } catch {
      toast.error('Erro ao remover')
    }
  }

  return (
    <AppLayout>
      <div className="p-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Broadcasts</h1>
            <p className="text-sm text-gray-500 mt-0.5">Campanhas de marketing via WhatsApp</p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Nova campanha
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total', value: stats.total, icon: Megaphone, color: 'text-gray-600 bg-gray-100' },
            { label: 'Em envio', value: stats.active, icon: RefreshCw, color: 'text-blue-600 bg-blue-50' },
            { label: 'Concluídas', value: stats.completed, icon: CheckCircle, color: 'text-green-600 bg-green-50' },
            { label: 'Msgs enviadas', value: stats.totalSent, icon: Send, color: 'text-primary-600 bg-primary-50' },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardContent className="flex items-center gap-3 py-4">
                <div className={cn('p-2 rounded-xl', color.split(' ')[1])}><Icon size={17} className={color.split(' ')[0]} /></div>
                <div>
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="text-xl font-bold text-gray-900">{value.toLocaleString('pt-BR')}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Warning banner */}
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
          <AlertCircle size={18} className="shrink-0 mt-0.5 text-amber-500" />
          <div>
            <strong>Anti-ban ativo:</strong> o sistema adiciona ±20% de jitter aleatório nos intervalos entre mensagens e sorteia variações automaticamente para reduzir a probabilidade de bloqueio pelo WhatsApp.
          </div>
        </div>

        {/* List */}
        {isLoading ? <PageSpinner /> : broadcasts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <Megaphone size={48} className="opacity-20 mb-4" />
            <p className="font-medium">Nenhuma campanha criada</p>
            <p className="text-sm mt-1">Crie sua primeira campanha para começar a engajar seus clientes</p>
            <Button className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus size={15} /> Criar campanha
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {broadcasts.map(b => (
              <BroadcastCard
                key={b.id}
                broadcast={b}
                onStart={() => handleStart(b.id)}
                onCancel={() => handleCancel(b.id)}
                onDelete={() => handleDelete(b.id)}
                onView={() => setViewing(b)}
                startLoading={startBroadcast.isPending}
                cancelLoading={cancelBroadcast.isPending}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nova campanha" size="lg">
        <BroadcastForm
          onSave={handleCreate}
          onClose={() => setShowCreate(false)}
          loading={createBroadcast.isPending}
        />
      </Modal>

      {/* Detail modal */}
      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.name ?? 'Detalhes'}
        size="lg"
      >
        {viewing && <BroadcastDetail broadcast={viewing} />}
      </Modal>
    </AppLayout>
  )
}
