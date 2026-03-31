import { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle, XCircle, Info, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../lib/utils'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: number
  message: string
  type: ToastType
  leaving?: boolean
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

let nextId = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 200)
  }, [])

  const toast = useCallback(
    (message: string, type: ToastType = 'success') => {
      const id = nextId++
      setToasts((prev) => [...prev, { id, message, type }])
      setTimeout(() => removeToast(id), 4000)
    },
    [removeToast],
  )

  const icons = {
    success: CheckCircle,
    error: XCircle,
    info: Info,
  }

  const colors = {
    success: 'text-ui-emerald bg-emerald-500/10 border-emerald-500/20 border-l-ui-emerald',
    error: 'text-ui-red bg-red-500/10 border-red-500/20 border-l-ui-red',
    info: 'text-ui-blue bg-blue-500/10 border-blue-500/20 border-l-ui-blue',
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-24 md:bottom-6 right-6 z-[60] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => {
            const Icon = icons[t.type]
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, x: 80, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 80, scale: 0.9, filter: 'blur(4px)' }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className={cn(
                  'pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border border-l-[3px] backdrop-blur-xl shadow-2xl shadow-black/40 min-w-[280px] max-w-[400px]',
                  colors[t.type],
                )}
              >
                <motion.span
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 0.1, type: 'spring', stiffness: 500, damping: 15 }}
                >
                  <Icon className="h-4.5 w-4.5 shrink-0" />
                </motion.span>
                <span className="text-sm font-medium text-text-primary flex-1">{t.message}</span>
                <button
                  onClick={() => removeToast(t.id)}
                  className="text-text-dim hover:text-text-secondary transition-colors shrink-0 hover:rotate-90 transition-transform duration-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
