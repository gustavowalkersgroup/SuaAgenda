'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/components/layout/AppLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { PageSpinner } from '@/components/ui/Spinner'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { Plus, Zap, Play, Pause, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

type Automation = {
  id: string
  name: string
  triggerType: string
  isActive: boolean
  sendFrom: string
  sendUntil: string
  createdAt: string
}

const TRIGGER_LABELS: Record<string, string> = {
  appointment_confirmed: 'Agendamento confirmado',
  appointment_cancelled: 'Agendamento cancelado',
  appointment_completed: 'Agendamento concluído',
  contact_created: 'Novo contato',
  payment_received: 'Pagamento recebido',
  inactivity: 'Contato inativo',
}

export default function AutomationsPage() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    name: '', triggerType: 'appointment_confirmed',
    delayMinutes: 0, sendFrom: '07:00', sendUntil: '19:00',
    messages: [''],
  })

  const { data, isLoading } = useQuery({
    queryKey: ['automations'],
    queryFn: () => api.get('/automations').then(r => r.data),
  })

  const create = useMutation({
    mutationFn: (d: typeof form) => api.post('/automations', d).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['automations'] }); setShowCreate(false); toast.success('Automação criada') },
    onError: () => toast.error('Erro ao criar automação'),
  })

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/automations/${id}`, { isActive }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations'] }),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/automations/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['automations'] }); toast.success('Removida') },
  })

  const automations: Automation[] = data?.data ?? []

  return (
    <AppLayout>
      <div className="p-4 md:p-8 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">Automações de Marketing</h1>
            <p className="text-sm text-gray-500 mt-1">Configure envios automáticos baseados em eventos</p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={16} />
            Nova automação
          </Button>
        </div>

        {isLoading ? <PageSpinner /> : automations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <Zap size={48} className="opacity-20 mb-4" />
            <p className="font-medium">Nenhuma automação configurada</p>
            <p className="text-sm mt-1">Crie automações para engajar seus clientes automaticamente</p>
          </div>
        ) : (
          <div className="space-y-3">
            {automations.map(a => (
              <Card key={a.id}>
                <CardContent className="flex items-center gap-4 py-4">
                  <div className={`p-2 rounded-xl ${a.isActive ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                    <Zap size={18} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900">{a.name}</p>
                      <Badge className={a.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                        {a.isActive ? 'Ativa' : 'Pausada'}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Gatilho: {TRIGGER_LABELS[a.triggerType] ?? a.triggerType}
                      {' · '}
                      Janela: {a.sendFrom}–{a.sendUntil}
                    </p>
                  </div>
                  <p className="text-xs text-gray-400">{formatDate(a.createdAt)}</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggle.mutate({ id: a.id, isActive: !a.isActive })}
                      className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      {a.isActive ? <Pause size={15} /> : <Play size={15} />}
                    </button>
                    <button
                      onClick={() => remove.mutate(a.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nova automação">
        <div className="space-y-4">
          <Input
            label="Nome"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Ex: Lembrete pós-confirmação"
          />
          <Select
            label="Gatilho"
            value={form.triggerType}
            onChange={e => setForm(f => ({ ...f, triggerType: e.target.value }))}
          >
            {Object.entries(TRIGGER_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
          <Input
            label="Atraso (minutos)"
            type="number"
            min={0}
            value={form.delayMinutes}
            onChange={e => setForm(f => ({ ...f, delayMinutes: Number(e.target.value) }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Enviar a partir de" type="time" value={form.sendFrom} onChange={e => setForm(f => ({ ...f, sendFrom: e.target.value }))} />
            <Input label="Enviar até" type="time" value={form.sendUntil} onChange={e => setForm(f => ({ ...f, sendUntil: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Mensagem</label>
            <textarea
              value={form.messages[0]}
              onChange={e => setForm(f => ({ ...f, messages: [e.target.value] }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              rows={3}
              placeholder="Olá {{nome}}, seu agendamento foi confirmado!"
            />
            <p className="text-xs text-gray-400 mt-1">Use {'{{nome}}'}, {'{{telefone}}'}, {'{{primeiro_nome}}'}</p>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={() => create.mutate(form)} loading={create.isPending} disabled={!form.name || !form.messages[0]}>
              Criar automação
            </Button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  )
}
