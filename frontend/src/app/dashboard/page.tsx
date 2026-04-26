'use client'
import { useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { PageSpinner } from '@/components/ui/Spinner'
import {
  useDashboardStats,
  useAppointmentTimeline,
  useTopServices,
  useTopProfessionals,
} from '@/hooks/useAnalytics'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  Calendar, Users, DollarSign, TrendingUp,
  ArrowUpRight, ArrowDownRight, Clock,
} from 'lucide-react'

function StatCard({
  title, value, sub, icon: Icon, trend, color = 'primary',
}: {
  title: string
  value: string | number
  sub?: string
  icon: React.ElementType
  trend?: number
  color?: string
}) {
  const iconColors: Record<string, string> = {
    primary: 'bg-primary-50 text-primary-600',
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
  }
  return (
    <Card>
      <CardContent className="flex items-start gap-4 py-5">
        <div className={`p-2.5 rounded-xl ${iconColors[color] ?? iconColors.primary}`}>
          <Icon size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-xl md:text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-medium ${trend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {trend >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {Math.abs(trend)}%
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const [days, setDays] = useState(30)
  const { data: stats, isLoading: loadingStats } = useDashboardStats(days)
  const { data: timeline, isLoading: loadingTimeline } = useAppointmentTimeline(days)
  const { data: topServices } = useTopServices(days)
  const { data: topProfessionals } = useTopProfessionals(days)

  return (
    <AppLayout>
      <div className="p-4 md:p-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Visão geral do seu negócio</p>
          </div>
          <Select
            value={String(days)}
            onChange={e => setDays(Number(e.target.value))}
            className="w-40"
          >
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
          </Select>
        </div>

        {/* Stat cards */}
        {loadingStats ? (
          <PageSpinner />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard
              title="Agendamentos"
              value={stats?.totalAppointments ?? 0}
              sub={`${stats?.confirmedAppointments ?? 0} confirmados`}
              icon={Calendar}
              trend={8}
              color="primary"
            />
            <StatCard
              title="Receita"
              value={formatCurrency(stats?.totalRevenue ?? 0)}
              sub={`${stats?.totalPayments ?? 0} pagamentos`}
              icon={DollarSign}
              trend={12}
              color="blue"
            />
            <StatCard
              title="Novos Contatos"
              value={stats?.newContacts ?? 0}
              sub={`${stats?.totalContacts ?? 0} no total`}
              icon={Users}
              trend={5}
              color="purple"
            />
            <StatCard
              title="Taxa de Ocupação"
              value={`${stats?.occupancyRate ?? 0}%`}
              sub="capacidade utilizada"
              icon={TrendingUp}
              trend={-2}
              color="orange"
            />
          </div>
        )}

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Timeline chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Agendamentos por dia</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingTimeline ? (
                <PageSpinner />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={timeline ?? []} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <defs>
                      <linearGradient id="colorAp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#16a34a" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v) => formatDate(v, 'dd/MM')}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      labelFormatter={(v) => formatDate(v, 'dd/MM/yyyy')}
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      name="Agendamentos"
                      stroke="#16a34a"
                      strokeWidth={2}
                      fill="url(#colorAp)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Top services */}
          <Card>
            <CardHeader>
              <CardTitle>Top Serviços</CardTitle>
            </CardHeader>
            <CardContent>
              {!topServices?.length ? (
                <p className="text-sm text-gray-400 text-center py-8">Sem dados</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={topServices.slice(0, 5)}
                    layout="vertical"
                    margin={{ top: 0, right: 4, bottom: 0, left: 0 }}
                  >
                    <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={90}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="total" name="Agendamentos" fill="#16a34a" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Top professionals */}
        <Card>
          <CardHeader>
            <CardTitle>Profissionais — desempenho</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!topProfessionals?.length ? (
              <p className="text-sm text-gray-400 text-center py-8">Sem dados</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500 text-xs">
                    <th className="px-6 py-3 text-left font-medium">Profissional</th>
                    <th className="px-6 py-3 text-right font-medium">Agendamentos</th>
                    <th className="px-6 py-3 text-right font-medium">Receita</th>
                    <th className="px-6 py-3 text-right font-medium">Cancelados</th>
                    <th className="px-6 py-3 text-right font-medium">Tempo médio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {topProfessionals.map((p: Record<string, unknown>, i: number) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 font-medium text-gray-900">{String(p.name)}</td>
                      <td className="px-6 py-3 text-right text-gray-600">{String(p.total)}</td>
                      <td className="px-6 py-3 text-right text-gray-600">{formatCurrency(Number(p.revenue ?? 0))}</td>
                      <td className="px-6 py-3 text-right text-red-500">{String(p.cancelled ?? 0)}</td>
                      <td className="px-6 py-3 text-right text-gray-400 flex items-center justify-end gap-1">
                        <Clock size={12} />
                        {String(p.avgDuration ?? 0)}min
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  )
}
