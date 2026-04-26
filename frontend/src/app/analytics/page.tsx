'use client'
import { useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { PageSpinner } from '@/components/ui/Spinner'
import {
  useAppointmentTimeline, useTopServices, useTopProfessionals,
  useContactsGrowth, useOccupancyRate,
} from '@/hooks/useAnalytics'
import { formatDate, formatCurrency } from '@/lib/utils'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'

export default function AnalyticsPage() {
  const [days, setDays] = useState(30)

  const { data: timeline, isLoading: lt } = useAppointmentTimeline(days)
  const { data: topSvcs } = useTopServices(days)
  const { data: topProfs } = useTopProfessionals(days)
  const { data: growth } = useContactsGrowth(days)
  const { data: occupancy } = useOccupancyRate(days)

  return (
    <AppLayout>
      <div className="p-4 md:p-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">Analytics</h1>
            <p className="text-sm text-gray-500 mt-1">Relatórios detalhados do seu negócio</p>
          </div>
          <Select
            value={String(days)}
            onChange={e => setDays(Number(e.target.value))}
            className="w-44"
          >
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
          </Select>
        </div>

        {/* Timeline */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Volume de agendamentos</CardTitle>
          </CardHeader>
          <CardContent>
            {lt ? <PageSpinner /> : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={timeline ?? []} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#16a34a" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gConfirmed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={v => formatDate(v, 'dd/MM')}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    labelFormatter={v => formatDate(v, 'dd/MM/yyyy')}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="total" name="Total" stroke="#16a34a" strokeWidth={2} fill="url(#gTotal)" />
                  <Area type="monotone" dataKey="confirmed" name="Confirmados" stroke="#3b82f6" strokeWidth={2} fill="url(#gConfirmed)" />
                  <Area type="monotone" dataKey="cancelled" name="Cancelados" stroke="#ef4444" strokeWidth={1.5} fill="none" strokeDasharray="4 2" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Top services */}
          <Card>
            <CardHeader>
              <CardTitle>Serviços mais agendados</CardTitle>
            </CardHeader>
            <CardContent>
              {!topSvcs?.length ? (
                <p className="text-sm text-gray-400 text-center py-8">Sem dados</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={topSvcs.slice(0, 8)} margin={{ top: 0, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      interval={0}
                      angle={-20}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="total" name="Agendamentos" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Contacts growth */}
          <Card>
            <CardHeader>
              <CardTitle>Crescimento de contatos</CardTitle>
            </CardHeader>
            <CardContent>
              {!growth?.length ? (
                <p className="text-sm text-gray-400 text-center py-8">Sem dados</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={growth} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={v => formatDate(v, 'dd/MM')}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      labelFormatter={v => formatDate(v, 'dd/MM/yyyy')}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="new" name="Novos" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="cumulative" name="Total acumulado" stroke="#06b6d4" strokeWidth={2} dot={false} strokeDasharray="5 3" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Occupancy heatmap-like + professionals */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Occupancy */}
          <Card>
            <CardHeader>
              <CardTitle>Taxa de ocupação por dia</CardTitle>
            </CardHeader>
            <CardContent>
              {!occupancy?.length ? (
                <p className="text-sm text-gray-400 text-center py-8">Sem dados</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={occupancy} margin={{ top: 0, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={v => formatDate(v, 'dd/MM')}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={v => `${v}%`}
                      domain={[0, 100]}
                    />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      formatter={(v: unknown) => [`${v}%`, 'Ocupação']}
                      labelFormatter={v => formatDate(v, 'dd/MM/yyyy')}
                    />
                    <Bar dataKey="rate" name="Ocupação %" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Top professionals */}
          <Card>
            <CardHeader>
              <CardTitle>Top profissionais</CardTitle>
            </CardHeader>
            <CardContent>
              {!topProfs?.length ? (
                <p className="text-sm text-gray-400 text-center py-8">Sem dados</p>
              ) : (
                <div className="space-y-3">
                  {topProfs.slice(0, 5).map((p: Record<string, unknown>, i: number) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-5 text-xs font-bold text-gray-400">#{i + 1}</span>
                      <div className="flex-1">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium text-gray-800">{String(p.name)}</span>
                          <span className="text-gray-500">{String(p.total)} agend.</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary-500 rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, (Number(p.total) / Number(topProfs[0]?.total ?? 1)) * 100)}%`,
                            }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-gray-400 mt-1">
                          <span>{formatCurrency(Number(p.revenue ?? 0))}</span>
                          <span>{String(p.cancelled ?? 0)} cancelados</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  )
}
