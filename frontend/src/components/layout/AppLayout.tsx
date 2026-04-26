'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { Sidebar } from './Sidebar'
import { PageSpinner } from '@/components/ui/Spinner'
import { Menu } from 'lucide-react'

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, init } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => { init() }, [init])

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) {
      router.push('/login')
    }
  }, [router])

  // Fecha sidebar ao navegar (mobile)
  useEffect(() => { setSidebarOpen(false) }, [pathname])

  if (!user) return <PageSpinner />

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — fixo no desktop, slide no mobile */}
      <div className={[
        'fixed inset-y-0 left-0 z-30 transition-transform duration-300 lg:relative lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
      ].join(' ')}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile topbar */}
        <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <Menu size={20} />
          </button>
          <span className="font-semibold text-gray-800 text-sm">SuaAgenda</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
