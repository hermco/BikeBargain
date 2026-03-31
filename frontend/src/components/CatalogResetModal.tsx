import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Loader2, Download, AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/Button'

interface CatalogResetModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupCount: number
  onExportThenReset: () => void
  onResetDirect: () => void
  isExporting: boolean
  isResetting: boolean
}

export function CatalogResetModal({
  open,
  onOpenChange,
  groupCount,
  onExportThenReset,
  onResetDirect,
  isExporting,
  isResetting,
}: CatalogResetModalProps) {
  const { t } = useTranslation()
  const [confirmText, setConfirmText] = useState('')
  const isPending = isExporting || isResetting

  function handleClose() {
    if (isPending) return
    setConfirmText('')
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(true) }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-md z-40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-md bg-surface border border-tint/[0.08] rounded-2xl z-50 shadow-2xl shadow-black/50 p-7">
          <Dialog.Title className="text-lg font-semibold text-text-primary font-fraunces flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            {t('catalog.resetConfirm')}
          </Dialog.Title>

          <p className="text-sm text-text-muted mt-3">
            {t('catalog.resetDescription', { count: groupCount })}
          </p>

          <div className="mt-5 space-y-3">
            <Button
              variant="secondary"
              className="w-full gap-2"
              onClick={onExportThenReset}
              disabled={isPending}
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {t('catalog.resetExportFirst')}
            </Button>

            <div className="border-t border-tint/[0.06] pt-3">
              <label className="text-xs text-text-dim block mb-1.5">
                {t('catalog.resetTypeConfirm')}
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="RESET"
                className="w-full rounded-xl bg-tint/[0.04] border border-tint/[0.08] px-3 py-2 text-sm text-text-primary placeholder-text-dim focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500/30 transition-all"
              />
              <Button
                variant="danger"
                className="w-full mt-2 gap-2"
                onClick={onResetDirect}
                disabled={confirmText !== 'RESET' || isPending}
              >
                {isResetting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {t('catalog.resetDirect')}
              </Button>
            </div>
          </div>

          <div className="flex justify-end mt-5">
            <Button variant="ghost" onClick={handleClose} disabled={isPending}>
              {t('common.cancel')}
            </Button>
          </div>

          <Dialog.Close asChild>
            <button
              onClick={handleClose}
              className="absolute top-5 right-5 text-text-dim hover:text-text-secondary transition-colors"
              aria-label={t('common.close')}
              disabled={isPending}
            >
              <X className="h-5 w-5" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
