'use client'
import { useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { PageSpinner } from '@/components/ui/Spinner'
import {
  useAppointments, useConfirmAppointment,
  useCancelAppointment, useProfessionals,
} from '@/hooks/useAppointments'
import { formatDate, formatCurrency, statusLabel, statusColor, cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, Calendar, Clock, User, CheckCircle, XCircle } from 'lucide-react'
import { format, addDays, subDays, startOfWeek, eachDayOfInterval, isSameDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import toast from 'react-hot-toast'

type Appointment = {
  id: string
  startAt: string
  endAt: string
  status: string
  contact: { name: string; phone: string }
  professional: { name: string }
  services: { name: string; duration: number; price: number }[]
}

const HOURS = Array.from({ length: 13 }, (_, i) => i + 7) // 7–19h

function TimeGrid({ appointments, day }: { appointments: Appointment[]; day: Date }) {
  const dayAppts = appointments.filter(a => isSameDay(new Date(a.startAt), day))

  return (
    <div className="relative">
      {HOURS.map(hour => (
        <div key={hour} className="flex border-b border-gray-100 min-h-[60px]">
          <div className="w-14 shrink-0 pr-3 pt-1 text-right text-xs text-gray-400 font-medium">
            {hour}:00
          </div>
          <div className="flex-1 relative pl-2">
            {dayAppts
              .filter(a => new Date(a.startAt).getHours() === hour)
              .map(a => {
                const start = new Date(a.startAt)
                const end = new Date(a.endAt)
                const durationMin = (end.getTime() - start.getTime()) / 60000
                const heightPx = (durationMin / 60) * 60
                return (
                  <div
                    key={a.id}
                    className={cn(
                      'absolute left-2 right-2 rounded-lg px-2 py-1 text-xs overflow-hidden border-l-2',
                      a.status === 'CONFIRMADO' ? 'bg-green-50 border-green-500 text-green-800' :
                      a.status === 'PRE_RESERVADO' ? 'bg-yellow-50 border-yellow-500 text-yellow-800' :
                      a.status === 'CANCELADO' ? 'bg-red-50 border-red-500 text-red-600 opacity-60' :
                      'bg-blue-50 border-blue-500 text-blue-800'
                    )}
                    style={{ minHeight: Math.max(heightPx, 28) }}
                  >
                    <p className="font-semibold truncate">{a.contact.name}</p>
                    <p className="truncate opacity-80">{a.services.map(s => s.name).join(', ')}</p>
                    <p className="opacity-70">
                      {format(start, 'HH:mm')} — {a.professional.name}
                    </p>
                  </div>
                )
              })}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function AgendaPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState<'day' | 'week'>('week')
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null)
  const [filterProfessional, setFilterProfessional] = useState('')

  const dateStr = format(currentDate, 'yyyy-MM-dd')
  const { data: apptData, isLoading } = useAppointments({
    date: dateStr,
    professionalId: filterProfessional || undefined,
  })
  const { data: professionals } = useProfessionals()
  const confirm = useConfirmAppointment()
  const cancel = useCancelAppointment()

  const appointments: Appointment[] = apptData?.data ?? []

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
  const weekDays = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) })

  function nav(dir: 1 | -1) {
    setCurrentDate(prev => (view === 'day' ? addDays(prev, dir) : addDays(prev, dir * 7)))
  }

  async function handleConfirm() {
    if (!selectedAppt) return
    try {
      await confirm.mutateAsync(selectedAppt.id)
      toast.success('Agendamento confirmado')
      setSelectedAppt(null)
    } catch {
      toast.error('Erro ao confirmar')
    }
  }

  async function handleCancel() {
    if (!selectedAppt) return
    try {
      await cancel.mutateAsync({ id: selectedAppt.id })
      toast.success('Agendamento cancelado')
      setSelectedAppt(null)
    } catch {
      toast.error('Erro ao cancelar')
    }
  }

  const totalRevenue = appointments
    .filter(a => a.status === 'CONFIRMADO' || a.status === 'CONCLUIDO')
    .reduce((sum, a) => sum + a.services.reduce((s, sv) => s + sv.price, 0), 0)

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {view === 'week'
                ? `Semana de ${formatDate(weekStart)} a ${formatDate(addDays(weekStart, 6))}`
                : formatDate(currentDate, "EEEE, dd 'de' MMMM")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select
              value={filterProfessional}
              onChange={e => setFilterProfessional(e.target.value)}
              className="w-44"
            >
              <option value="">Todos profissionais</option>
              {professionals?.data?.map((p: { id: string; name: string }) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              {(['day', 'week'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                    view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  )}
                >
                  {v === 'day' ? 'Dia' : 'Semana'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => nav(-1)}>
                <ChevronLeft size={16} />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
                Hoje
              </Button>
              <Button variant="outline" size="sm" onClick={() => nav(1)}>
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <Calendar size={20} className="text-primary-600" />
              <div>
                <p className="text-xs text-gray-500">Total do dia</p>
                <p className="text-xl font-bold text-gray-900">{appointments.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <CheckCircle size={20} className="text-green-600" />
              <div>
                <p className="text-xs text-gray-500">Confirmados</p>
                <p className="text-xl font-bold text-gray-900">
                  {appointments.filter(a => a.status === 'CONFIRMADO').length}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <Clock size={20} className="text-blue-600" />
              <div>
                <p className="text-xs text-gray-500">Receita prevista</p>
                <p className="text-xl font-bold text-gray-900">{formatCurrency(totalRevenue)}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Calendar grid */}
        {isLoading ? (
          <PageSpinner />
        ) : view === 'week' ? (
          <Card>
            <div className="overflow-x-auto">
              {/* Day headers */}
              <div className="grid border-b border-gray-200" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
                <div className="w-14" />
                {weekDays.map(day => (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'text-center py-3 text-sm font-medium border-l border-gray-100',
                      isSameDay(day, new Date()) ? 'text-primary-600' : 'text-gray-600'
                    )}
                  >
                    <p className="text-xs text-gray-400 capitalize">
                      {format(day, 'EEE', { locale: ptBR })}
                    </p>
                    <p className={cn('text-lg mt-0.5', isSameDay(day, new Date()) && 'font-bold text-primary-600')}>
                      {format(day, 'd')}
                    </p>
                  </div>
                ))}
              </div>
              {/* Time rows */}
              {HOURS.map(hour => (
                <div
                  key={hour}
                  className="grid border-b border-gray-50"
                  style={{ gridTemplateColumns: '56px repeat(7, 1fr)', minHeight: 60 }}
                >
                  <div className="pr-3 pt-1 text-right text-xs text-gray-400 font-medium">{hour}:00</div>
                  {weekDays.map(day => {
                    const appts = appointments.filter(
                      a => isSameDay(new Date(a.startAt), day) && new Date(a.startAt).getHours() === hour
                    )
                    return (
                      <div key={day.toISOString()} className="border-l border-gray-50 px-1 py-0.5">
                        {appts.map(a => (
                          <button
                            key={a.id}
                            onClick={() => setSelectedAppt(a)}
                            className={cn(
                              'w-full rounded px-1.5 py-1 text-left text-xs mb-0.5 border-l-2 truncate',
                              a.status === 'CONFIRMADO' ? 'bg-green-50 border-green-500 text-green-800' :
                              a.status === 'PRE_RESERVADO' ? 'bg-yellow-50 border-yellow-500 text-yellow-800' :
                              'bg-gray-50 border-gray-400 text-gray-600'
                            )}
                          >
                            <span className="font-medium">{format(new Date(a.startAt), 'HH:mm')}</span>
                            {' '}
                            {a.contact.name}
                          </button>
                        ))}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{formatDate(currentDate, "EEEE, dd 'de' MMMM")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <TimeGrid appointments={appointments} day={currentDate} />
            </CardContent>
          </Card>
        )}

        {/* List view below grid */}
        {appointments.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Lista de agendamentos</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500 text-xs">
                    <th className="px-6 py-3 text-left font-medium">Horário</th>
                    <th className="px-6 py-3 text-left font-medium">Cliente</th>
                    <th className="px-6 py-3 text-left font-medium">Serviço(s)</th>
                    <th className="px-6 py-3 text-left font-medium">Profissional</th>
                    <th className="px-6 py-3 text-left font-medium">Status</th>
                    <th className="px-6 py-3 text-right font-medium">Valor</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {appointments.map(a => (
                    <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 text-gray-600">
                        {format(new Date(a.startAt), 'HH:mm')} – {format(new Date(a.endAt), 'HH:mm')}
                      </td>
                      <td className="px-6 py-3">
                        <p className="font-medium text-gray-900">{a.contact.name}</p>
                        <p className="text-xs text-gray-400">{a.contact.phone}</p>
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        {a.services.map(s => s.name).join(', ')}
                      </td>
                      <td className="px-6 py-3 text-gray-600 flex items-center gap-1">
                        <User size={13} className="text-gray-400" />
                        {a.professional.name}
                      </td>
                      <td className="px-6 py-3">
                        <Badge className={statusColor(a.status)}>{statusLabel(a.status)}</Badge>
                      </td>
                      <td className="px-6 py-3 text-right text-gray-600">
                        {formatCurrency(a.services.reduce((s, sv) => s + sv.price, 0))}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <button
                          onClick={() => setSelectedAppt(a)}
                          className="text-xs text-primary-600 hover:underline"
                        >
                          Detalhes
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Appointment detail modal */}
      <Modal
        open={!!selectedAppt}
        onClose={() => setSelectedAppt(null)}
        title="Detalhes do agendamento"
      >
        {selectedAppt && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-50 rounded-xl">
                <Calendar size={20} className="text-primary-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{selectedAppt.contact.name}</p>
                <p className="text-sm text-gray-500">{selectedAppt.contact.phone}</p>
              </div>
              <Badge className={cn('ml-auto', statusColor(selectedAppt.status))}>
                {statusLabel(selectedAppt.status)}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-1">Data e hora</p>
                <p className="font-medium">
                  {formatDate(selectedAppt.startAt)} — {format(new Date(selectedAppt.startAt), 'HH:mm')} às {format(new Date(selectedAppt.endAt), 'HH:mm')}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-1">Profissional</p>
                <p className="font-medium">{selectedAppt.professional.name}</p>
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-2">Serviços</p>
              <div className="space-y-2">
                {selectedAppt.services.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{s.name}</span>
                    <div className="flex items-center gap-4 text-gray-500">
                      <span className="flex items-center gap-1"><Clock size={12} />{s.duration}min</span>
                      <span className="font-medium text-gray-900">{formatCurrency(s.price)}</span>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-semibold pt-2 border-t border-gray-100">
                  <span>Total</span>
                  <span>{formatCurrency(selectedAppt.services.reduce((s, sv) => s + sv.price, 0))}</span>
                </div>
              </div>
            </div>

            {(selectedAppt.status === 'PRE_RESERVADO' || selectedAppt.status === 'CONFIRMADO') && (
              <div className="flex gap-3 pt-2">
                {selectedAppt.status === 'PRE_RESERVADO' && (
                  <Button onClick={handleConfirm} loading={confirm.isPending} className="flex-1">
                    <CheckCircle size={16} />
                    Confirmar
                  </Button>
                )}
                <Button
                  variant="danger"
                  onClick={handleCancel}
                  loading={cancel.isPending}
                  className="flex-1"
                >
                  <XCircle size={16} />
                  Cancelar
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </AppLayout>
  )
}
