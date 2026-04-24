'use client'
import { useState, useRef, useEffect } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import {
  useConversations, useMessages, useAssignConversation,
  useCloseConversation, useSendMessage,
} from '@/hooks/useConversations'
import { formatRelative, formatDateTime, cn } from '@/lib/utils'
import {
  Search, Send, Bot, UserCheck, X, CheckCheck,
  MessageSquare, PhoneCall, User,
} from 'lucide-react'
import toast from 'react-hot-toast'

type Conversation = {
  id: string
  contact: { id: string; name: string; phone: string }
  status: string
  assigneeType: string
  lastMessage: string | null
  lastMessageAt: string | null
  unreadCount: number
}

type Message = {
  id: string
  direction: 'inbound' | 'outbound'
  content: string
  type: string
  createdAt: string
  senderName?: string
}

function ConversationItem({
  conv, active, onClick,
}: { conv: Conversation; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-start gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left border-b border-gray-100',
        active && 'bg-primary-50 border-l-2 border-l-primary-500'
      )}
    >
      <Avatar name={conv.contact.name} size="md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-gray-900 truncate">{conv.contact.name}</span>
          <span className="text-xs text-gray-400 shrink-0">
            {conv.lastMessageAt ? formatRelative(conv.lastMessageAt) : ''}
          </span>
        </div>
        <p className="text-xs text-gray-500 truncate mt-0.5">{conv.lastMessage ?? 'Sem mensagens'}</p>
        <div className="flex items-center gap-2 mt-1.5">
          {conv.assigneeType === 'ia' ? (
            <span className="flex items-center gap-1 text-xs text-purple-600">
              <Bot size={11} /> IA
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-blue-600">
              <User size={11} /> Humano
            </span>
          )}
          {conv.unreadCount > 0 && (
            <span className="ml-auto bg-primary-500 text-white text-xs font-medium rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
              {conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

function MessageBubble({ msg }: { msg: Message }) {
  const isOut = msg.direction === 'outbound'
  return (
    <div className={cn('flex gap-2 max-w-[80%]', isOut ? 'ml-auto flex-row-reverse' : '')}>
      {!isOut && <Avatar name={msg.senderName ?? 'C'} size="sm" />}
      <div>
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isOut
              ? 'bg-primary-600 text-white rounded-br-sm'
              : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
          )}
        >
          {msg.content}
        </div>
        <div className={cn('flex items-center gap-1 mt-1 px-1', isOut ? 'justify-end' : '')}>
          <span className="text-xs text-gray-400">{formatDateTime(msg.createdAt)}</span>
          {isOut && <CheckCheck size={13} className="text-primary-400" />}
        </div>
      </div>
    </div>
  )
}

export default function InboxPage() {
  const [status, setStatus] = useState('aberta')
  const [search, setSearch] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const { data: convData, isLoading } = useConversations({ status, search })
  const { data: msgData } = useMessages(activeId ?? '', 1)
  const assign = useAssignConversation()
  const close = useCloseConversation()
  const sendMsg = useSendMessage()

  const conversations: Conversation[] = convData?.data ?? []
  const messages: Message[] = msgData?.data ?? []
  const activeConv = conversations.find(c => c.id === activeId) ?? null

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function handleSend() {
    if (!text.trim() || !activeId) return
    try {
      await sendMsg.mutateAsync({ conversationId: activeId, content: text.trim() })
      setText('')
    } catch {
      toast.error('Erro ao enviar mensagem')
    }
  }

  async function handleAssign(type: 'ia' | 'humano') {
    if (!activeId) return
    try {
      await assign.mutateAsync({ id: activeId, type })
      toast.success(type === 'humano' ? 'Atribuído a humano' : 'Retornado para IA')
    } catch {
      toast.error('Erro ao atribuir')
    }
  }

  async function handleClose() {
    if (!activeId) return
    try {
      await close.mutateAsync(activeId)
      setActiveId(null)
      toast.success('Conversa encerrada')
    } catch {
      toast.error('Erro ao encerrar')
    }
  }

  return (
    <AppLayout>
      <div className="flex h-screen">
        {/* Sidebar list */}
        <div className="w-80 border-r border-gray-200 bg-white flex flex-col">
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 mb-3">Inbox</h2>
            <Input
              placeholder="Buscar conversa..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              leftIcon={<Search size={15} />}
            />
            <div className="flex gap-1 mt-3">
              {['aberta', 'fechada'].map(s => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={cn(
                    'flex-1 py-1.5 text-xs font-medium rounded-lg capitalize transition-colors',
                    status === s
                      ? 'bg-primary-600 text-white'
                      : 'text-gray-500 hover:bg-gray-100'
                  )}
                >
                  {s === 'aberta' ? 'Abertas' : 'Fechadas'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {isLoading ? (
              <PageSpinner />
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                <MessageSquare size={32} className="opacity-30" />
                <p className="text-sm">Nenhuma conversa</p>
              </div>
            ) : (
              conversations.map(conv => (
                <ConversationItem
                  key={conv.id}
                  conv={conv}
                  active={conv.id === activeId}
                  onClick={() => setActiveId(conv.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Chat area */}
        {activeConv ? (
          <div className="flex-1 flex flex-col bg-gray-50">
            {/* Chat header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
              <Avatar name={activeConv.contact.name} size="md" />
              <div className="flex-1">
                <p className="font-semibold text-gray-900">{activeConv.contact.name}</p>
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <PhoneCall size={11} />
                  {activeConv.contact.phone}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {activeConv.assigneeType === 'ia' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleAssign('humano')}
                    loading={assign.isPending}
                  >
                    <UserCheck size={14} />
                    Assumir
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleAssign('ia')}
                    loading={assign.isPending}
                  >
                    <Bot size={14} />
                    Para IA
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClose}
                  loading={close.isPending}
                >
                  <X size={14} />
                  Encerrar
                </Button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-6 space-y-4">
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-400">
                  <p className="text-sm">Sem mensagens ainda</p>
                </div>
              ) : (
                messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="bg-white border-t border-gray-200 px-4 py-4">
              <div className="flex items-end gap-3">
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder="Digite uma mensagem... (Enter para enviar)"
                  className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 max-h-32"
                  rows={1}
                />
                <Button onClick={handleSend} loading={sendMsg.isPending} size="md">
                  <Send size={16} />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50">
            <MessageSquare size={48} className="opacity-20 mb-3" />
            <p className="text-base font-medium">Selecione uma conversa</p>
            <p className="text-sm mt-1 opacity-70">Escolha uma conversa à esquerda para começar</p>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
