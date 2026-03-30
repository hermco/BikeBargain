import { NavLink, useNavigate } from 'react-router-dom'
import { BarChart3, Trophy, LayoutGrid, Plus, Search, Wrench, Globe, ArrowLeft } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/utils'
import { useFormatters } from '../hooks/useFormatters'
import { useStats } from '../hooks/queries'
import { useContext } from 'react'
import { ModelCtx } from '../hooks/useCurrentModel'
import { EASE_OUT_EXPO } from './animations'

function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const currentLang = i18n.language?.startsWith('fr') ? 'fr' : 'en'

  return (
    <div className="flex items-center gap-1.5 px-4">
      <Globe className="h-3.5 w-3.5 text-text-dim shrink-0" />
      <div className="flex rounded-lg bg-white/[0.04] border border-white/[0.06] p-0.5">
        <button
          onClick={() => i18n.changeLanguage('fr')}
          className={cn(
            'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all',
            currentLang === 'fr'
              ? 'bg-amber-500/15 text-amber-300 shadow-sm'
              : 'text-text-dim hover:text-text-secondary',
          )}
        >
          FR
        </button>
        <button
          onClick={() => i18n.changeLanguage('en')}
          className={cn(
            'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all',
            currentLang === 'en'
              ? 'bg-amber-500/15 text-amber-300 shadow-sm'
              : 'text-text-dim hover:text-text-secondary',
          )}
        >
          EN
        </button>
      </div>
    </div>
  )
}

function NavItem({ to, icon: Icon, label, index = 0 }: { to: string; icon: React.ElementType; label: string; index?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.1 + index * 0.05, duration: 0.35, ease: EASE_OUT_EXPO }}
    >
      <NavLink
        to={to}
        end={to.endsWith('/ads')}
        className={({ isActive }) =>
          cn(
            'relative flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group overflow-hidden',
            isActive
              ? 'bg-gradient-to-r from-amber-500/15 to-amber-500/5 text-amber-300 shadow-[inset_0_0_0_1px_rgba(212,168,83,0.15)]'
              : 'text-text-muted hover:text-text-secondary hover:bg-white/[0.04]',
          )
        }
      >
        {({ isActive }) => (
          <>
            {/* Left accent bar — animated */}
            <motion.span
              className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full bg-amber-400"
              initial={false}
              animate={{ height: isActive ? 20 : 0, opacity: isActive ? 1 : 0 }}
              transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
            />
            {/* Hover glow background */}
            <span className="absolute inset-0 rounded-xl bg-amber-500/0 group-hover:bg-amber-500/[0.03] transition-colors duration-300" />
            <Icon
              className={cn(
                'h-[18px] w-[18px] shrink-0 transition-all duration-200',
                isActive ? 'text-amber-300' : 'group-hover:scale-110 group-hover:text-text-secondary',
              )}
            />
            <span className="hidden md:inline relative">{label}</span>
          </>
        )}
      </NavLink>
    </motion.div>
  )
}

function NavSectionLabel({ label }: { label: string }) {
  return (
    <p className="px-4 pt-1 pb-0.5 text-[10px] font-semibold tracking-widest uppercase text-text-dim select-none">
      {label}
    </p>
  )
}

function SidebarStats() {
  const ctx = useContext(ModelCtx)
  const slug = ctx?.slug ?? ''
  const { data: stats } = useStats(slug)
  const { t } = useTranslation()
  const { formatPrice } = useFormatters()
  if (!ctx || !stats) return null

  return (
    <motion.div
      className="mx-3 rounded-xl overflow-hidden border border-white/[0.06] shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.4, ease: EASE_OUT_EXPO }}
    >
      {/* Colored top accent line */}
      <div className="h-[3px] bg-gradient-to-r from-amber-500/60 via-amber-400/80 to-amber-500/40" />
      <div className="px-4 py-3 bg-white/[0.02]">
        <p className="text-[10px] text-text-dim uppercase tracking-widest font-semibold mb-3">
          {t('sidebar.summary')}
        </p>
        <div className="space-y-2.5 text-xs">
          {/* Ads count */}
          <div className="flex justify-between items-center group/stat">
            <span className="text-text-muted flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400/70 shrink-0 transition-transform group-hover/stat:scale-150" />
              {t('sidebar.ads')}
            </span>
            <span className="text-text-primary font-medium tabular-nums">{stats.count}</span>
          </div>
          {/* Avg price */}
          <div className="flex justify-between items-center group/stat">
            <span className="text-text-muted flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80 shrink-0 transition-transform group-hover/stat:scale-150" />
              {t('sidebar.avgPrice')}
            </span>
            <span className="text-amber-300 font-medium tabular-nums">{formatPrice(stats.price.mean)}</span>
          </div>
          {/* Median price */}
          <div className="flex justify-between items-center group/stat">
            <span className="text-text-muted flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/70 shrink-0 transition-transform group-hover/stat:scale-150" />
              {t('sidebar.medianPrice')}
            </span>
            <span className="text-text-primary font-medium tabular-nums">{formatPrice(stats.price.median)}</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export function Sidebar() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const ctx = useContext(ModelCtx)

  const primaryNav = ctx
    ? [
        { to: ctx.modelUrl('/rankings'), icon: Trophy, labelKey: 'nav.ranking' },
        { to: ctx.modelUrl('/crawl'), icon: Search, labelKey: 'nav.search' },
      ]
    : []
  const secondaryNav = ctx
    ? [
        { to: ctx.modelUrl('/ads'), icon: LayoutGrid, labelKey: 'nav.ads' },
        { to: ctx.modelUrl('/stats'), icon: BarChart3, labelKey: 'nav.stats' },
        { to: ctx.modelUrl('/catalog'), icon: Wrench, labelKey: 'nav.accessories' },
      ]
    : []
  const allNav = [...primaryNav, ...secondaryNav]

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-60 flex-col bg-bg/80 backdrop-blur-xl border-r border-white/[0.06] z-30">

        {/* Logo area — more breathing room + separator */}
        <motion.div
          className="flex items-center gap-3 px-6 pt-7 pb-5"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
        >
          <motion.div
            className="w-9 h-9 shrink-0 flex items-center justify-center"
            whileHover={{ scale: 1.1, rotate: -5 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          >
            <svg width="36" height="36" viewBox="0 0 110 110" fill="none" style={{ filter: 'drop-shadow(0 4px 12px rgba(212,168,83,0.3))' }}>
              <defs>
                <linearGradient id="sidebarGauge" x1="0" y1="0" x2="110" y2="110" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#fbbf24"/>
                  <stop offset="100%" stopColor="#d97706"/>
                </linearGradient>
              </defs>
              <circle cx="55" cy="55" r="50" stroke="rgba(255,255,255,0.1)" strokeWidth="4" fill="none"/>
              <path d="M 18.4 80 A 50 50 0 1 1 91.6 80" stroke="url(#sidebarGauge)" strokeWidth="4.5" strokeLinecap="round" fill="none"/>
              <line x1="55" y1="9" x2="55" y2="17" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round"/>
              <line x1="9" y1="55" x2="17" y2="55" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round"/>
              <line x1="101" y1="55" x2="93" y2="55" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round"/>
              <line x1="55" y1="55" x2="76" y2="32" stroke="#d4a853" strokeWidth="2.5" strokeLinecap="round"/>
              <circle cx="55" cy="55" r="5.5" fill="#d4a853"/>
              <circle cx="55" cy="55" r="2.5" fill="#0c0f14"/>
            </svg>
          </motion.div>
          <div>
            <span className="font-semibold text-sm tracking-tight text-text-primary">BikeBargain</span>
            {ctx && (
              <motion.span
                className="block text-[10px] text-text-muted tracking-widest uppercase"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.3 }}
              >
                {ctx.model.brand} {ctx.model.name}
              </motion.span>
            )}
          </div>
        </motion.div>
        {/* Subtle separator below logo */}
        <div className="h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent mx-4 mb-3" />

        {ctx && (
          <div className="px-4 mb-2">
            <NavLink
              to="/?browse=1"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] text-text-dim hover:text-text-secondary hover:bg-white/[0.03] transition-all"
            >
              <ArrowLeft className="h-3 w-3" />
              {t('nav.allModels')}
            </NavLink>
          </div>
        )}

        {ctx?.model.image_url && (
          <div className="mx-3 mb-3 rounded-xl overflow-hidden border border-white/[0.06]">
            <img
              src={ctx.model.image_url}
              alt={`${ctx.model.brand} ${ctx.model.name}`}
              className="w-full h-28 object-cover transition-transform duration-700 ease-out hover:scale-105"
              style={{ animation: 'zoomIn 0.6s ease-out both' }}
            />
          </div>
        )}

        {/* Navigation */}
        <nav className="flex flex-col gap-0.5 p-3">
          {primaryNav.length > 0 && (
            <>
              <NavSectionLabel label={t('nav.main')} />
              {primaryNav.map((n, i) => (
                <NavItem key={n.to} to={n.to} icon={n.icon} label={t(n.labelKey)} index={i} />
              ))}
              <div className="h-px bg-white/[0.04] mx-2 my-1.5" />
            </>
          )}
          {secondaryNav.length > 0 && (
            <>
              <NavSectionLabel label={t('nav.explore')} />
              {secondaryNav.map((n, i) => (
                <NavItem key={n.to} to={n.to} icon={n.icon} label={t(n.labelKey)} index={i + primaryNav.length} />
              ))}
            </>
          )}
        </nav>

        <div className="mt-4">
          <SidebarStats />
        </div>

        <div className="mt-auto p-4 space-y-3">
          {ctx && (
            <motion.button
              onClick={() => navigate(ctx.modelUrl('/ads?add=true'))}
              className={cn(
                'relative flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl w-full',
                'bg-gradient-to-r from-amber-500 to-amber-600 text-bg text-xs font-semibold',
                'shadow-[0_0_16px_rgba(245,158,11,0.35)]',
                'transition-colors duration-200 hover:from-amber-400 hover:to-amber-500',
              )}
              whileHover={{ scale: 1.03, boxShadow: '0 0 28px rgba(245,158,11,0.5)' }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              <motion.span
                animate={{ rotate: [0, 0, 90, 0] }}
                transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 5, ease: 'easeInOut' }}
              >
                <Plus className="h-3.5 w-3.5" />
              </motion.span>
              {t('sidebar.addAd')}
            </motion.button>
          )}
          <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
          <LanguageSwitcher />
          <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
          <p className="text-[10px] text-text-dim text-center">
            {t('sidebar.footer')}
          </p>
          {__GIT_BRANCH__ !== 'master' && __GIT_BRANCH__ !== 'main' && (
            <div className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20">
              <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              <span className="text-[10px] text-violet-300 font-mono font-medium truncate">{__GIT_BRANCH__}</span>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile bottom nav — glass effect + active indicators */}
      <nav
        className={cn(
          'md:hidden fixed bottom-0 left-0 right-0 z-30',
          'bg-bg/70 backdrop-blur-2xl backdrop-saturate-150',
          'border-t border-white/[0.08]',
          'shadow-[0_-8px_32px_rgba(0,0,0,0.4)]',
          'flex justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] px-2',
        )}
      >
        {allNav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to.endsWith('/ads')}
            className={({ isActive }) =>
              cn(
                'relative flex flex-col items-center gap-1 px-4 py-2 text-[10px] font-medium rounded-xl transition-all duration-200 min-w-[52px]',
                isActive ? 'text-amber-300' : 'text-text-muted active:text-text-secondary',
              )
            }
          >
            {({ isActive }) => (
              <>
                <motion.span
                  animate={isActive ? { scale: 1.15, y: -1 } : { scale: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                >
                  <n.icon className="h-5 w-5" />
                </motion.span>
                <span>{t(n.labelKey)}</span>
                {/* Active dot indicator — animated */}
                <motion.span
                  className="absolute bottom-0.5 left-1/2 -translate-x-1/2 rounded-full bg-amber-400"
                  initial={false}
                  animate={{
                    width: isActive ? 12 : 0,
                    height: 3,
                    opacity: isActive ? 1 : 0,
                  }}
                  transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                />
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
