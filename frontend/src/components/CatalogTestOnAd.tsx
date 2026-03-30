import { useState } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { useTestOnAd } from '../hooks/queries'
import { CategoryBadge } from './AccessoryBadge'
import { Card } from './ui/Card'
import type { TestOnAdMatch } from '../lib/api'

export function CatalogTestOnAd() {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const testMut = useTestOnAd()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return
    const isId = /^\d+$/.test(trimmed)
    testMut.mutate(isId ? { ad_id: parseInt(trimmed, 10) } : { text: trimmed })
  }

  const matches: TestOnAdMatch[] = testMut.data?.matches ?? []

  return (
    <Card className="p-4">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-dim" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('catalog.testOnAdPlaceholder')}
            className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] pl-9 pr-4 py-2.5 text-sm text-text-primary placeholder-text-dim focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/30 transition-all"
          />
        </div>
        <button
          type="submit"
          disabled={testMut.isPending || !input.trim()}
          className="px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.08] text-sm text-text-secondary hover:bg-white/[0.1] hover:text-text-primary disabled:opacity-40 disabled:pointer-events-none transition-all"
        >
          {testMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            t('catalog.testOnAd')
          )}
        </button>
      </form>

      <AnimatePresence>
        {testMut.isSuccess && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-white/[0.06]">
              <h4 className="text-[11px] text-text-muted uppercase tracking-widest font-semibold mb-2">
                {t('catalog.testResults')}
              </h4>
              {matches.length === 0 ? (
                <p className="text-sm text-text-dim py-2">{t('catalog.noTestResults')}</p>
              ) : (
                <div className="space-y-1.5">
                  {matches.map((m, i) => (
                    <div
                      key={`${m.group_key}-${m.variant}-${i}`}
                      className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-white/[0.02]"
                    >
                      <CategoryBadge category={m.group} />
                      <span className="text-sm text-text-primary flex-1">{m.variant}</span>
                      <span className="text-xs text-text-dim font-mono truncate max-w-48">
                        {m.matched_text}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}
