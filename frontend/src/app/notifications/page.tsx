'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/components/layout/AppLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PageSpinner } from '@/components/ui/Spinner'
import { api } from '@/lib/api'
import { Bell, Settings, Save } from 'lucide-react'
import toast from 'react-hot-toast'

type NotifConfig = {
  id?: string
  reminderHoursBefore: number[]
  reminderMessage: string
  confirmationMessage: string
  sendFrom: string
  sendUntil: string
}

export default function NotificationsPage() {
  const qc = useQueryClient()
  const [config, setConfig] = useState<NotifConfig>({
    reminderHoursBefore: [24, 2],
    reminderMessage: 'Olá {{nome}}! Lembrete: você tem um agendamento amanhã às {{horario}}.',
    confirmationMessage: 'Olá {{nome}}! Seu agendamento de {{servico}} com {{profissional}} em {{data}} às {{horario}} está confirmado!',
    sendFrom: '07:00',
    sendUntil: '19:00',
  })

  const { data, isLoading } = useQuery({
    queryKey: ['notification-config'],
    queryFn: () => api.get('/notifications/config').then(r => {
      if (r.data) setConfig(r.data)
      return r.data
    }),
  })

  const save = useMutation({
    mutationFn: (d: NotifConfig) => api.post('/notifications/config', d).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notification-config'] }); toast.success('Configurações salvas') },
    onError: () => toast.error('Erro ao salvar'),
  })

  return (
    <AppLayout>
      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2.5 bg-primary-50 rounded-xl text-primary-600">
            <Bell size={22} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">Notificações</h1>
            <p className="text-sm text-gray-500 mt-0.5">Configure lembretes e confirmações automáticas</p>
          </div>
        </div>

        {isLoading ? <PageSpinner /> : (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Janela de envio</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Enviar a partir de"
                    type="time"
                    value={config.sendFrom}
                    onChange={e => setConfig(c => ({ ...c, sendFrom: e.target.value }))}
                  />
                  <Input
                    label="Enviar até"
                    type="time"
                    value={config.sendUntil}
                    onChange={e => setConfig(c => ({ ...c, sendUntil: e.target.value }))}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Lembretes de agendamento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-2">
                    Enviar lembretes com quantas horas de antecedência?
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 6, 12, 24, 48].map(h => {
                      const active = config.reminderHoursBefore.includes(h)
                      return (
                        <button
                          key={h}
                          onClick={() => setConfig(c => ({
                            ...c,
                            reminderHoursBefore: active
                              ? c.reminderHoursBefore.filter(x => x !== h)
                              : [...c.reminderHoursBefore, h].sort((a, b) => a - b),
                          }))}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                            active
                              ? 'bg-primary-600 text-white border-primary-600'
                              : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400'
                          }`}
                        >
                          {h}h
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Mensagem de lembrete</label>
                  <textarea
                    value={config.reminderMessage}
                    onChange={e => setConfig(c => ({ ...c, reminderMessage: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                    rows={3}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Variáveis: {'{{nome}}'} {'{{horario}}'} {'{{servico}}'} {'{{profissional}}'} {'{{data}}'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Confirmação pós-pagamento</CardTitle>
              </CardHeader>
              <CardContent>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Mensagem de confirmação</label>
                  <textarea
                    value={config.confirmationMessage}
                    onChange={e => setConfig(c => ({ ...c, confirmationMessage: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                    rows={3}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Variáveis: {'{{nome}}'} {'{{servico}}'} {'{{profissional}}'} {'{{data}}'} {'{{horario}}'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Button onClick={() => save.mutate(config)} loading={save.isPending} size="lg">
              <Save size={16} />
              Salvar configurações
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
