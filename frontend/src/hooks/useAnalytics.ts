import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useDashboardStats(days = 30) {
  return useQuery({
    queryKey: ['analytics', 'dashboard', days],
    queryFn: () => api.get(`/analytics/dashboard?days=${days}`).then(r => r.data),
  })
}

export function useAppointmentTimeline(days = 30) {
  return useQuery({
    queryKey: ['analytics', 'timeline', days],
    queryFn: () => api.get(`/analytics/appointments/timeline?days=${days}`).then(r => r.data),
  })
}

export function useTopServices(days = 30) {
  return useQuery({
    queryKey: ['analytics', 'top-services', days],
    queryFn: () => api.get(`/analytics/services/top?days=${days}`).then(r => r.data),
  })
}

export function useTopProfessionals(days = 30) {
  return useQuery({
    queryKey: ['analytics', 'top-professionals', days],
    queryFn: () => api.get(`/analytics/professionals/top?days=${days}`).then(r => r.data),
  })
}

export function useContactsGrowth(days = 30) {
  return useQuery({
    queryKey: ['analytics', 'contacts-growth', days],
    queryFn: () => api.get(`/analytics/contacts/growth?days=${days}`).then(r => r.data),
  })
}

export function useOccupancyRate(days = 30) {
  return useQuery({
    queryKey: ['analytics', 'occupancy', days],
    queryFn: () => api.get(`/analytics/occupancy?days=${days}`).then(r => r.data),
  })
}
