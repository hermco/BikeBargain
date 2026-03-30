import { useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { useBikeModels } from '../hooks/queries'
import { useFormatters } from '../hooks/useFormatters'

export function LandingPage() {
  const { t } = useTranslation()
  const { formatPrice } = useFormatters()
  const { data: models, isLoading } = useBikeModels()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const browsing = searchParams.get('browse') === '1'

  // Auto-redirect if only 1 model (unless user explicitly navigated here)
  useEffect(() => {
    if (!browsing && models && models.length === 1) {
      navigate(`/models/${models[0].slug}/rankings`, { replace: true })
    }
  }, [models, navigate, browsing])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
      </div>
    )
  }

  if (!models || models.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-text-muted">{t('landing.empty')}</p>
      </div>
    )
  }

  // If only 1 model and not explicitly browsing, the useEffect handles redirect
  if (!browsing && models.length === 1) return null

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-4xl"
      >
        <div className="text-center mb-12">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 mx-auto mb-4">
            <span className="text-bg font-bold text-xl font-fraunces">B</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight font-fraunces text-text-primary">
            {t('landing.title')}
          </h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {models.map((model, i) => (
            <motion.div
              key={model.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
            >
              <Link
                to={`/models/${model.slug}/rankings`}
                className="group block rounded-2xl border border-white/[0.06] bg-surface/80 backdrop-blur-sm hover:border-amber-500/20 hover:shadow-2xl hover:shadow-amber-500/[0.05] transition-all duration-300 overflow-hidden"
              >
                {model.image_url && (
                  <div className="h-40 bg-bg overflow-hidden">
                    <img
                      src={model.image_url}
                      alt={model.name}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500 ease-out"
                    />
                  </div>
                )}
                <div className="p-5 space-y-3">
                  <div>
                    <p className="text-[10px] text-text-dim uppercase tracking-widest font-semibold">{model.brand}</p>
                    <h2 className="text-lg font-semibold text-text-primary font-fraunces group-hover:text-amber-200 transition-colors">
                      {model.name}
                    </h2>
                  </div>
                  <div className="flex items-center justify-between text-xs text-text-muted">
                    <span>{model.ad_count} {t('landing.ads')}</span>
                    {model.min_price != null && model.max_price != null && (
                      <span>{formatPrice(model.min_price)} — {formatPrice(model.max_price)}</span>
                    )}
                    {model.ad_count === 0 && (
                      <span className="text-text-dim">{t('landing.noAds')}</span>
                    )}
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
