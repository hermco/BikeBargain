import { useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Loader2, ArrowRight } from 'lucide-react'
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
    <div className="relative min-h-screen flex flex-col items-center justify-center px-6 py-16 overflow-hidden">

      {/* Page-level ambient radial glow */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% 0%, color-mix(in srgb, var(--color-amber-500) 8%, transparent) 0%, transparent 70%)',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-4xl"
      >
        {/* Hero */}
        <div className="text-center mb-14">
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1] }}
            className="mx-auto mb-6 relative"
          >
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              className="w-20 h-20 flex items-center justify-center"
            >
              <svg width="80" height="80" viewBox="0 0 110 110" fill="none" style={{ filter: 'drop-shadow(0 8px 24px rgba(212,168,83,0.3))' }}>
                <defs>
                  <linearGradient id="heroGauge" x1="0" y1="0" x2="110" y2="110" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#fbbf24"/>
                    <stop offset="100%" stopColor="#d97706"/>
                  </linearGradient>
                </defs>
                <circle cx="55" cy="55" r="50" stroke="rgba(255,255,255,0.1)" strokeWidth="3.5" fill="none"/>
                <path d="M 18.4 80 A 50 50 0 1 1 91.6 80" stroke="url(#heroGauge)" strokeWidth="4" strokeLinecap="round" fill="none"/>
                <line x1="55" y1="9" x2="55" y2="17" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="91" y1="27" x2="86" y2="31" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="19" y1="27" x2="24" y2="31" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="101" y1="55" x2="95" y2="55" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="9" y1="55" x2="15" y2="55" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="55" y1="55" x2="76" y2="32" stroke="#d4a853" strokeWidth="2.5" strokeLinecap="round"/>
                <circle cx="55" cy="55" r="5" fill="#d4a853"/>
                <circle cx="55" cy="55" r="2.5" fill="#0c0f14"/>
              </svg>
            </motion.div>
            {/* Glow beneath logo */}
            <motion.div
              className="absolute -inset-4 rounded-[2rem] bg-amber-500/10 blur-2xl -z-10"
              animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.45 }}
            className="text-4xl font-semibold tracking-tight font-fraunces text-text-primary"
          >
            {t('landing.title')}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.45 }}
            className="mt-3 text-base text-text-muted max-w-md mx-auto"
          >
            {t('landing.subtitle')}
          </motion.p>
        </div>

        {/* Model cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {models.map((model, i) => {
            const medianPrice = (model as typeof model & { median_price?: number }).median_price
            return (
              <motion.div
                key={model.id}
                initial={{ opacity: 0, scale: 0.93, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: 0.22 + i * 0.09, duration: 0.45, ease: 'easeOut' }}
              >
                <Link
                  to={`/models/${model.slug}/rankings`}
                  className="group block rounded-2xl border border-white/[0.06] bg-surface/80 backdrop-blur-sm overflow-hidden transition-all duration-500 ease-out hover:border-amber-500/25 hover:shadow-[0_8px_40px_rgba(212,168,83,0.12)] hover:-translate-y-1"
                >
                  {/* Card image with gradient overlay */}
                  {model.image_url && (
                    <div className="relative h-44 bg-surface/80 overflow-hidden">
                      <img
                        src={model.image_url}
                        alt={model.name}
                        className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-700 ease-out"
                      />
                      {/* Bottom-to-surface gradient — seamless blend */}
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          background:
                            'linear-gradient(to bottom, transparent 50%, var(--color-surface) 100%)',
                        }}
                      />
                    </div>
                  )}

                  {/* Card body */}
                  <div className="p-5 space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] text-amber-500/70 uppercase tracking-widest font-semibold mb-0.5">
                          {model.brand}
                        </p>
                        <h2 className="text-xl font-semibold text-text-primary font-fraunces leading-tight group-hover:text-amber-200 transition-colors duration-200">
                          {model.name}
                        </h2>
                      </div>

                      {/* Arrow indicator — fades in on hover */}
                      <div className="shrink-0 mt-1 w-7 h-7 rounded-full border border-white/[0.08] bg-white/[0.04] flex items-center justify-center opacity-0 group-hover:opacity-100 group-hover:border-amber-500/30 group-hover:bg-amber-500/10 transition-all duration-300 -translate-x-1 group-hover:translate-x-0">
                        <ArrowRight className="w-3.5 h-3.5 text-amber-400 transition-transform duration-200 group-hover:translate-x-0.5" />
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center justify-between text-xs text-text-muted border-t border-white/[0.05] pt-3">
                      {model.ad_count > 0 ? (
                        <span>{model.ad_count} {t('landing.ads')}</span>
                      ) : (
                        <span className="text-text-dim">{t('landing.noAds')}</span>
                      )}

                      <div className="flex items-center gap-2">
                        {medianPrice != null ? (
                          <span className="text-amber-400/80 font-medium">
                            {t('landing.medianPrice')} {formatPrice(medianPrice)}
                          </span>
                        ) : model.min_price != null && model.max_price != null ? (
                          <span>{formatPrice(model.min_price)} — {formatPrice(model.max_price)}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            )
          })}
        </div>
      </motion.div>
    </div>
  )
}
