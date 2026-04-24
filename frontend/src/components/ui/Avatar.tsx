import { cn, getInitials } from '@/lib/utils'

interface AvatarProps {
  name: string
  src?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-12 h-12 text-base' }

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn('rounded-full object-cover', sizes[size], className)}
      />
    )
  }
  const colors = [
    'bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-orange-500',
    'bg-teal-500', 'bg-indigo-500', 'bg-green-500', 'bg-red-500',
  ]
  const colorIndex = name.charCodeAt(0) % colors.length
  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-semibold text-white',
        sizes[size],
        colors[colorIndex],
        className
      )}
    >
      {getInitials(name)}
    </div>
  )
}
