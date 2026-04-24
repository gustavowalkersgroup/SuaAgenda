'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { Sidebar } from './Sidebar'
import { PageSpinner } from '@/components/ui/Spinner'

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, init } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) {
      router.push('/login')
    }
  }, [router])

  if (!user) return <PageSpinner />

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
