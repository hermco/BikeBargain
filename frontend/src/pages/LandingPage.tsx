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
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
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

      {/* Multi-layer ambient glow for depth */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div
          style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse 80% 50% at 50% 0%, color-mix(in srgb, var(--color-amber-500) 8%, transparent) 0%, transparent 70%)',
          }}
        />
        <div
          style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse 60% 40% at 30% 80%, color-mix(in srgb, var(--color-amber-500) 3%, transparent) 0%, transparent 60%)',
          }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-4xl"
      >
        {/* Hero */}
        <div className="text-center mb-16">
          <motion.div
            initial={{ scale: 0.6, opacity: 0, rotate: -10 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto mb-8 relative"
          >
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              className="w-20 h-20 mx-auto flex items-center justify-center"
            >
              <svg width="80" height="80" viewBox="0 0 110 110" fill="none" style={{ filter: 'drop-shadow(0 8px 32px rgba(212,168,83,0.35))' }}>
                <defs>
                  <linearGradient id="heroGauge" x1="0" y1="0" x2="110" y2="110" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#fbbf24"/>
                    <stop offset="100%" stopColor="#d97706"/>
                  </linearGradient>
                </defs>
                <circle cx="55" cy="55" r="50" stroke="rgb(from var(--color-tint) r g b / 0.12)" strokeWidth="3.5" fill="none"/>
                <path d="M 11.7 80 A 50 50 0 1 1 98.3 80" stroke="url(#heroGauge)" strokeWidth="4" strokeLinecap="round" fill="none"/>
                <line x1="55" y1="5" x2="55" y2="15" stroke="rgb(from var(--color-tint) r g b / 0.2)" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="94" y1="24" x2="87" y2="30" stroke="rgb(from var(--color-tint) r g b / 0.2)" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="16" y1="24" x2="23" y2="30" stroke="rgb(from var(--color-tint) r g b / 0.2)" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="105" y1="55" x2="95" y2="55" stroke="rgb(from var(--color-tint) r g b / 0.2)" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="5" y1="55" x2="15" y2="55" stroke="rgb(from var(--color-tint) r g b / 0.2)" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="55" y1="55" x2="76" y2="32" stroke="#d4a853" strokeWidth="2.5" strokeLinecap="round"/>
                <circle cx="55" cy="55" r="5" fill="#d4a853"/>
                <circle cx="55" cy="55" r="2.5" fill="var(--color-gauge-dot)"/>
              </svg>
            </motion.div>
            {/* Layered glow beneath logo */}
            <motion.div
              className="absolute -inset-6 rounded-[2rem] bg-amber-500/8 blur-3xl -z-10"
              animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="absolute -inset-12 rounded-full bg-amber-400/4 blur-[60px] -z-20"
              animate={{ scale: [1.1, 1, 1.1], opacity: [0.2, 0.4, 0.2] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
            />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="text-4xl md:text-5xl font-semibold tracking-tight font-fraunces text-text-primary"
          >
            {t('landing.title')}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 text-base text-text-muted max-w-lg mx-auto leading-relaxed"
          >
            {t('landing.subtitle')}
          </motion.p>
        </div>

        {/* Model cards grid */}
        <div className="flex flex-wrap justify-center gap-7">
          {models.map((model, i) => {
            const medianPrice = (model as typeof model & { median_price?: number }).median_price
            return (
              <motion.div
                key={model.id}
                className="w-[300px]"
                initial={{ opacity: 0, scale: 0.92, y: 24 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.1, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              >
                <Link
                  to={`/models/${model.slug}/rankings`}
                  className="group relative flex flex-col rounded-2xl border border-tint/[0.06] bg-surface overflow-hidden transition-all duration-600 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-amber-500/20 hover:shadow-[0_16px_56px_rgba(212,168,83,0.14)] hover:-translate-y-1.5"
                >
                  {/* Full-card background image */}
                  {model.image_url && (
                    <img
                      src={model.image_url}
                      alt={model.name}
                      className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform group-hover:scale-[1.06]"
                    />
                  )}

                  {/* Gradient overlay — cinematic fade */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        'linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, transparent 25%, var(--color-surface) 72%)',
                    }}
                  />

                  {/* Spacer to push content down */}
                  <div className="h-44" />

                  {/* Card body */}
                  <div className="relative z-10 px-5 pb-5 space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] text-amber-500/70 uppercase tracking-[0.2em] font-semibold mb-1">
                          {model.brand}
                        </p>
                        <h2 className="text-xl font-semibold text-text-primary font-fraunces leading-tight group-hover:text-accent-text transition-colors duration-300">
                          {model.name}
                        </h2>
                      </div>

                      {/* Arrow indicator */}
                      <div className="shrink-0 mt-1 w-8 h-8 rounded-full border border-tint/[0.08] bg-tint/[0.03] flex items-center justify-center opacity-0 group-hover:opacity-100 group-hover:border-amber-500/25 group-hover:bg-amber-500/10 transition-all duration-400 -translate-x-2 group-hover:translate-x-0">
                        <ArrowRight className="w-3.5 h-3.5 text-accent transition-transform duration-300 group-hover:translate-x-0.5" />
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center justify-between text-xs text-text-muted border-t border-tint/[0.05] pt-3">
                      {model.ad_count > 0 ? (
                        <span className="tabular-nums">{model.ad_count} {t('landing.ads')}</span>
                      ) : (
                        <span className="text-text-dim">{t('landing.noAds')}</span>
                      )}

                      <div className="flex items-center gap-2">
                        {medianPrice != null ? (
                          <span className="text-accent/80 font-medium tabular-nums">
                            {t('landing.medianPrice')} {formatPrice(medianPrice)}
                          </span>
                        ) : model.min_price != null && model.max_price != null ? (
                          <span className="tabular-nums">{formatPrice(model.min_price)} — {formatPrice(model.max_price)}</span>
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
