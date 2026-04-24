'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'

export function useAuth(redirectIfUnauth = true) {
  const { user, token, init } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    if (redirectIfUnauth && !token && typeof window !== 'undefined') {
      const stored = localStorage.getItem('token')
      if (!stored) router.push('/login')
    }
  }, [token, redirectIfUnauth, router])

  return { user, token, isLoading: !user && !!token }
}
