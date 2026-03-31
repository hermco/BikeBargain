import { motion, useInView, type Variants } from 'framer-motion'
import { useRef, useEffect, useState } from 'react'

// ─── Shared easing curves ────────────────────────────────────────────────────

export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const
export const EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const

// ─── Fade-in on scroll (IntersectionObserver powered) ────────────────────────

interface FadeInProps {
  children: React.ReactNode
  className?: string
  delay?: number
  direction?: 'up' | 'down' | 'left' | 'right' | 'none'
  distance?: number
  duration?: number
  once?: boolean
}

const directionOffset = {
  up: { y: 1 },
  down: { y: -1 },
  left: { x: 1 },
  right: { x: -1 },
  none: {},
}

export function FadeIn({
  children,
  className,
  delay = 0,
  direction = 'up',
  distance = 24,
  duration = 0.5,
  once = true,
}: FadeInProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once, margin: '-40px' })

  const offset = directionOffset[direction] as { x?: number; y?: number }
  const initial = {
    opacity: 0,
    ...(offset.x != null ? { x: offset.x * distance } : {}),
    ...(offset.y != null ? { y: offset.y * distance } : {}),
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={initial}
      animate={isInView ? { opacity: 1, x: 0, y: 0 } : initial}
      transition={{ duration, delay, ease: EASE_OUT_EXPO }}
    >
      {children}
    </motion.div>
  )
}

// ─── Stagger container + children ────────────────────────────────────────────

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
    },
  },
}

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.4, ease: EASE_OUT_EXPO },
  },
}

export function StaggerList({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-20px' })

  return (
    <motion.div
      ref={ref}
      className={className}
      variants={staggerContainer}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <motion.div className={className} variants={staggerItem}>
      {children}
    </motion.div>
  )
}

// ─── Page transition wrapper ─────────────────────────────────────────────────

export function PageTransition({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
    >
      {children}
    </motion.div>
  )
}

// ─── Animated counter (counts up from 0) ─────────────────────────────────────

export function AnimatedNumber({
  value,
  duration = 1.2,
  formatFn,
}: {
  value: number
  duration?: number
  formatFn?: (n: number) => string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true })
  const [displayed, setDisplayed] = useState(0)

  useEffect(() => {
    if (!isInView) return
    const start = performance.now()
    const from = 0
    const to = value

    function tick(now: number) {
      const elapsed = (now - start) / 1000
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayed(Math.round(from + (to - from) * eased))
      if (progress < 1) requestAnimationFrame(tick)
    }

    requestAnimationFrame(tick)
  }, [isInView, value, duration])

  return <span ref={ref}>{formatFn ? formatFn(displayed) : displayed}</span>
}

// ─── Glow on hover (wraps a card) ────────────────────────────────────────────

export function HoverGlow({
  children,
  className,
  color = 'rgba(212, 168, 83, 0.08)',
}: {
  children: React.ReactNode
  className?: string
  color?: string
}) {
  return (
    <motion.div
      className={`relative ${className ?? ''}`}
      whileHover="hover"
      initial="rest"
    >
      <motion.div
        className="absolute -inset-1 rounded-3xl blur-xl pointer-events-none"
        variants={{
          rest: { opacity: 0, scale: 0.95 },
          hover: { opacity: 1, scale: 1 },
        }}
        transition={{ duration: 0.3 }}
        style={{ background: color }}
      />
      <div className="relative">{children}</div>
    </motion.div>
  )
}

// ─── Pulse dot (for live indicators) ─────────────────────────────────────────

export function PulseDot({
  color = 'bg-emerald-400',
  size = 'w-2 h-2',
}: {
  color?: string
  size?: string
}) {
  return (
    <span className="relative inline-flex">
      <span className={`${size} rounded-full ${color}`} />
      <span className={`absolute inset-0 ${size} rounded-full ${color} animate-ping opacity-40`} />
    </span>
  )
}
