'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/components/layout/AppLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import {
  Settings, Smartphone, Key, Users, Save,
  CheckCircle, XCircle, RefreshCw, Eye, EyeOff,
} from 'lucide-react'
import toast from 'react-hot-toast'

export default function SettingsPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'workspace' | 'whatsapp' | 'ai' | 'payments'>('workspace')

  const tabs = [
    { id: 'workspace', label: 'Workspace', icon: Settings },
    { id: 'whatsapp', label: 'WhatsApp', icon: Smartphone },
    { id: 'ai', label: 'IA / OpenAI', icon: Key },
    { id: 'payments', label: 'Pagamentos', icon: Users },
  ] as const

  return (
    <AppLayout>
      <div className="p-8 max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
          <p className="text-sm text-gray-500 mt-1">Gerencie o seu workspace e integrações</p>
        </div>

        <div className="flex gap-8">
          {/* Tab nav */}
          <nav className="w-44 shrink-0 space-y-1">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === id
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="flex-1">
            {tab === 'workspace' && <WorkspaceSettings />}
            {tab === 'whatsapp' && <WhatsAppSettings />}
            {tab === 'ai' && <AISettings />}
            {tab === 'payments' && <PaymentSettings />}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

function WorkspaceSettings() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['workspace'],
    queryFn: () => api.get('/workspaces/current').then(r => r.data),
  })
  const [name, setName] = useState('')
  const [timezone, setTimezone] = useState('America/Sao_Paulo')

  const save = useMutation({
    mutationFn: (d: object) => api.put('/workspaces/current', d).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workspace'] }); toast.success('Salvo') },
    onError: () => toast.error('Erro ao salvar'),
  })

  if (isLoading) return <PageSpinner />

  return (
    <Card>
      <CardHeader><CardTitle>Dados do workspace</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <Input
          label="Nome do workspace"
          value={name || data?.name || ''}
          onChange={e => setName(e.target.value)}
        />
        <Select
          label="Fuso horário"
          value={timezone}
          onChange={e => setTimezone(e.target.value)}
        >
          <option value="America/Sao_Paulo">America/São_Paulo (UTC-3)</option>
          <option value="America/Manaus">America/Manaus (UTC-4)</option>
          <option value="America/Belem">America/Belém (UTC-3)</option>
        </Select>
        <Button onClick={() => save.mutate({ name: name || data?.name, timezone })} loading={save.isPending}>
          <Save size={15} />
          Salvar
        </Button>
      </CardContent>
    </Card>
  )
}

function WhatsAppSettings() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['whatsapp-numbers'],
    queryFn: () => api.get('/whatsapp/numbers').then(r => r.data),
  })
  const [phone, setPhone] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [instanceName, setInstanceName] = useState('')
  const [purpose, setPurpose] = useState<'atendimento' | 'marketing'>('atendimento')
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [qrPolling, setQrPolling] = useState<string | null>(null) // id do número aguardando QR

  const add = useMutation({
    mutationFn: (d: object) => api.post('/whatsapp/numbers', d).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-numbers'] })
      setPhone(''); setDisplayName(''); setInstanceName('')
      toast.success('Número adicionado — clique em Conectar para gerar o QR Code')
    },
    onError: () => toast.error('Erro ao adicionar'),
  })

  // Polling do QR Code (a cada 4s enquanto aguardando)
  const { data: qrData } = useQuery({
    queryKey: ['whatsapp-qr', qrPolling],
    queryFn: () => api.get(`/whatsapp/numbers/${qrPolling}/qrcode`).then(r => r.data),
    enabled: !!qrPolling,
    refetchInterval: 4000,
  })

  // Para o polling se conectou ou recebeu QR
  const qrCode: string | null = qrData?.qr_code ?? null
  const isConnected: boolean = qrData?.is_connected ?? false
  if (isConnected && qrPolling) setQrPolling(null)

  async function handleConnect(id: string) {
    setConnectingId(id)
    try {
      await api.post(`/whatsapp/numbers/${id}/connect`)
      setQrPolling(id)
      toast.success('Aguardando QR Code...')
      qc.invalidateQueries({ queryKey: ['whatsapp-numbers'] })
    } catch {
      toast.error('Erro ao iniciar conexão')
    } finally {
      setConnectingId(null)
    }
  }

  type WaNumber = { id: string; instance_name: string; phone_number: string; display_name: string; purpose: string; is_connected: boolean }
  const numbers: WaNumber[] = Array.isArray(data) ? data : []

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Números cadastrados</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <PageSpinner /> : numbers.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum número cadastrado ainda</p>
          ) : (
            <div className="space-y-4">
              {numbers.map(n => (
                <div key={n.id}>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900">{n.display_name || n.instance_name}</p>
                      <p className="text-xs text-gray-500">{n.phone_number} · {n.purpose}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={n.is_connected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                        {n.is_connected ? (
                          <span className="flex items-center gap-1"><CheckCircle size={11} /> Conectado</span>
                        ) : qrPolling === n.id ? (
                          <span className="flex items-center gap-1"><RefreshCw size={11} className="animate-spin" /> Aguardando QR...</span>
                        ) : (
                          <span className="flex items-center gap-1"><XCircle size={11} /> Desconectado</span>
                        )}
                      </Badge>
                      {!n.is_connected && (
                        <Button
                          size="sm" variant="secondary"
                          onClick={() => handleConnect(n.id)}
                          loading={connectingId === n.id}
                          disabled={!!qrPolling}
                        >
                          <RefreshCw size={13} /> {qrPolling === n.id ? 'Conectando...' : 'Conectar'}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* QR Code exibido abaixo do número que está conectando */}
                  {qrPolling === n.id && qrCode && (
                    <div className="mt-3 p-4 rounded-xl border-2 border-dashed border-green-300 bg-green-50 text-center">
                      <p className="text-sm font-medium text-green-800 mb-3">
                        📱 Escaneie com seu WhatsApp
                      </p>
                      <img
                        src={qrCode}
                        alt="QR Code WhatsApp"
                        className="mx-auto w-48 h-48 rounded-lg"
                      />
                      <p className="text-xs text-green-600 mt-2">
                        Abra o WhatsApp → Dispositivos vinculados → Vincular dispositivo
                      </p>
                      <button
                        onClick={() => qc.invalidateQueries({ queryKey: ['whatsapp-qr', n.id] })}
                        className="mt-2 text-xs text-green-700 underline"
                      >
                        Atualizar QR Code
                      </button>
                    </div>
                  )}
                  {qrPolling === n.id && !qrCode && (
                    <div className="mt-3 p-4 rounded-xl border border-dashed border-amber-200 bg-amber-50 text-center">
                      <RefreshCw size={20} className="animate-spin text-amber-500 mx-auto mb-2" />
                      <p className="text-sm text-amber-700">Gerando QR Code... aguarde alguns segundos</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Adicionar número</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input
            label="Nome da instância *"
            value={instanceName}
            onChange={e => setInstanceName(e.target.value.replace(/\s/g, '-').toLowerCase())}
            placeholder="atendimento-principal"
          />
          <p className="text-xs text-gray-400 -mt-2">Identificador único sem espaços. Ex: atendimento-loja-1</p>
          <Input label="Nome de exibição" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Ex: Atendimento Principal" />
          <Input label="Número (com DDI)" value={phone} onChange={e => setPhone(e.target.value)} placeholder="5511999999999" />
          <Select label="Finalidade" value={purpose} onChange={e => setPurpose(e.target.value as 'atendimento' | 'marketing')}>
            <option value="atendimento">Atendimento</option>
            <option value="marketing">Marketing</option>
          </Select>
          <Button
            onClick={() => add.mutate({ instanceName, phoneNumber: phone, displayName, purpose })}
            loading={add.isPending}
            disabled={!phone || !instanceName}
          >
            Adicionar número
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function AISettings() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['ai-config'],
    queryFn: () => api.get('/ai/config').then(r => r.data),
  })

  const [openaiKey, setOpenaiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [model, setModel] = useState('gpt-4o')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(1000)
  const [isActive, setIsActive] = useState(true)
  const [initialized, setInitialized] = useState(false)

  // Populate from loaded data once
  if (data && !initialized) {
    setModel(data.model ?? 'gpt-4o')
    setSystemPrompt(data.systemPrompt ?? '')
    setTemperature(data.temperature ?? 0.7)
    setMaxTokens(data.maxTokens ?? 1000)
    setIsActive(data.isActive ?? true)
    setInitialized(true)
  }

  const saveKey = useMutation({
    mutationFn: (k: string) => api.put('/workspaces/current', { openai_api_key: k }).then(r => r.data),
    onSuccess: () => { setOpenaiKey(''); toast.success('Chave OpenAI salva') },
    onError: () => toast.error('Erro ao salvar chave'),
  })

  const saveConfig = useMutation({
    mutationFn: (d: object) => api.put('/ai/config', d).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ai-config'] }); toast.success('Configuração da IA salva') },
    onError: () => toast.error('Erro ao salvar'),
  })

  const verbosityOptions = [
    { value: 100,  label: 'Concisa (≤100 tokens)' },
    { value: 300,  label: 'Normal (≤300 tokens)' },
    { value: 700,  label: 'Detalhada (≤700 tokens)' },
    { value: 1500, label: 'Completa (≤1500 tokens)' },
    { value: 4096, label: 'Máxima (≤4096 tokens)' },
  ]

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-4">
      {/* OpenAI API Key */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Key size={16} /> Chave OpenAI</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-gray-500">A chave é criptografada (AES-256) antes de ser armazenada.</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? 'text' : 'password'}
                value={openaiKey}
                onChange={e => setOpenaiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <Button onClick={() => saveKey.mutate(openaiKey)} loading={saveKey.isPending} disabled={!openaiKey}>
              <Save size={14} /> Salvar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Model & Behavior */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Comportamento da IA</CardTitle>
            <button onClick={() => setIsActive(v => !v)} className="flex items-center gap-2 text-sm">
              <span className={isActive ? 'text-green-600 font-medium' : 'text-gray-400'}>
                {isActive ? 'IA Ativa' : 'IA Inativa'}
              </span>
              <div className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${isActive ? 'bg-green-500' : 'bg-gray-300'}`}>
                <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${isActive ? 'translate-x-4' : ''}`} />
              </div>
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <Select label="Modelo" value={model} onChange={e => setModel(e.target.value)}>
            <option value="gpt-4o">GPT-4o (recomendado)</option>
            <option value="gpt-4o-mini">GPT-4o mini (econômico)</option>
            <option value="gpt-4-turbo">GPT-4 Turbo</option>
          </Select>

          {/* Temperature slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-gray-700">Criatividade (temperatura)</label>
              <span className="text-sm font-semibold text-primary-600">{temperature.toFixed(1)}</span>
            </div>
            <input
              type="range" min={0} max={2} step={0.1}
              value={temperature}
              onChange={e => setTemperature(Number(e.target.value))}
              className="w-full accent-primary-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-0.5">
              <span>Preciso (0)</span><span>Balanceado (1)</span><span>Criativo (2)</span>
            </div>
          </div>

          {/* Verbosity / max tokens */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Verbosidade das respostas</label>
            <div className="grid grid-cols-1 gap-2">
              {verbosityOptions.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMaxTokens(opt.value)}
                  className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                    maxTokens === opt.value
                      ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* System prompt */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Prompt do sistema</label>
            <textarea
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              rows={8}
              placeholder="Você é um assistente de atendimento para..."
            />
          </div>

          <Button
            onClick={() => saveConfig.mutate({ model, systemPrompt, temperature, maxTokens, isActive })}
            loading={saveConfig.isPending}
          >
            <Save size={15} /> Salvar configuração
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function PaymentSettings() {
  const [provider, setProvider] = useState('mercadopago')
  const [accessToken, setAccessToken] = useState('')
  const qc = useQueryClient()

  const save = useMutation({
    mutationFn: (d: object) => api.post('/payments/gateway/config', d).then(r => r.data),
    onSuccess: () => { toast.success('Gateway configurado'); setAccessToken('') },
    onError: () => toast.error('Erro ao salvar'),
  })

  return (
    <Card>
      <CardHeader><CardTitle>Gateway de pagamento</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <Select
          label="Provedor"
          value={provider}
          onChange={e => setProvider(e.target.value)}
        >
          <option value="mercadopago">MercadoPago</option>
          <option value="asaas">Asaas</option>
        </Select>
        <Input
          label="Access Token / API Key"
          type="password"
          value={accessToken}
          onChange={e => setAccessToken(e.target.value)}
          placeholder="••••••••••••••••"
        />
        <p className="text-xs text-gray-400">
          A chave é criptografada com AES-256 antes de ser armazenada.
        </p>
        <Button
          onClick={() => save.mutate({ provider, accessToken })}
          loading={save.isPending}
          disabled={!accessToken}
        >
          <Save size={15} />
          Salvar configuração
        </Button>
      </CardContent>
    </Card>
  )
}
