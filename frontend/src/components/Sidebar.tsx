import { NavLink, useNavigate } from 'react-router-dom'
import { BarChart3, Trophy, LayoutGrid, Plus, Search, Wrench, Globe, ArrowLeft, Sun, Moon, Settings } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/utils'
import { useFormatters } from '../hooks/useFormatters'
import { useStats } from '../hooks/queries'
import { useContext } from 'react'
import { ModelCtx } from '../hooks/useCurrentModel'
import { useTheme } from '../hooks/useTheme'
import { EASE_OUT_EXPO } from './animations'

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  function handleToggle() {
    document.documentElement.classList.add('theme-transitioning')
    toggleTheme()
    setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 350)
  }

  return (
    <motion.button
      onClick={handleToggle}
      className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-b from-tint/[0.06] to-tint/[0.03] border border-tint/[0.07] shadow-[0_1px_3px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.03)] text-text-dim hover:text-accent-text hover:bg-tint/[0.1] hover:border-tint/[0.12] transition-all"
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
          transition={{ duration: 0.2 }}
        >
          {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  )
}

function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const currentLang = i18n.language?.startsWith('fr') ? 'fr' : 'en'

  return (
    <div className="flex rounded-lg bg-gradient-to-b from-tint/[0.06] to-tint/[0.03] border border-tint/[0.07] shadow-[0_1px_3px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.03)] p-0.5">
      <button
        onClick={() => i18n.changeLanguage('fr')}
        className={cn(
          'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all',
          currentLang === 'fr'
            ? 'bg-accent-subtle text-accent-text shadow-sm'
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
            ? 'bg-accent-subtle text-accent-text shadow-sm'
            : 'text-text-dim hover:text-text-secondary',
        )}
      >
        EN
      </button>
    </div>
  )
}

function NavItem({ to, icon: Icon, label, index = 0 }: { to: string; icon: React.ElementType; label: string; index?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.1 + index * 0.05, duration: 0.4, ease: EASE_OUT_EXPO }}
    >
      <NavLink
        to={to}
        end={to.endsWith('/ads')}
        className={({ isActive }) =>
          cn(
            'relative flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 group overflow-hidden',
            isActive
              ? 'bg-gradient-to-r from-amber-500/[0.14] via-amber-500/[0.07] to-transparent text-accent-text shadow-[inset_0_1px_0_rgba(212,168,83,0.1),inset_0_0_0_1px_rgba(212,168,83,0.08)]'
              : 'text-text-muted hover:text-text-secondary hover:bg-tint/[0.05] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]',
          )
        }
      >
        {({ isActive }) => (
          <>
            {/* Left accent bar */}
            <motion.span
              className="absolute left-0 top-1/2 -translate-y-1/2 w-[2.5px] rounded-r-full bg-gradient-to-b from-amber-300 via-amber-400 to-amber-600"
              initial={false}
              animate={{ height: isActive ? 20 : 0, opacity: isActive ? 1 : 0 }}
              transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
            />
            {/* Active glow */}
            {isActive && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-12 h-12 bg-amber-400/[0.06] rounded-full blur-xl pointer-events-none" />
            )}
            <span className="absolute inset-0 rounded-xl bg-amber-500/0 group-hover:bg-amber-500/[0.03] transition-colors duration-400" />
            <Icon
              className={cn(
                'h-[18px] w-[18px] shrink-0 transition-all duration-300',
                isActive ? 'text-accent-text drop-shadow-[0_0_6px_rgba(251,191,36,0.3)]' : 'group-hover:scale-110 group-hover:text-text-secondary',
              )}
            />
            <span className="hidden md:inline relative">{label}</span>
          </>
        )}
      </NavLink>
    </motion.div>
  )
}

function SidebarStats() {
  const ctx = useContext(ModelCtx)
  const slug = ctx?.slug ?? ''
  const { data: stats } = useStats(slug)
  const { t } = useTranslation()
  const { formatPrice } = useFormatters()
  if (!ctx || !stats) return null

  const items = [
    { label: t('sidebar.ads'), value: String(stats.count), color: 'bg-sky-400/70', glow: 'shadow-[0_0_6px_rgba(56,189,248,0.15)]' },
    { label: t('sidebar.avgPrice'), value: formatPrice(stats.price.mean), color: 'bg-amber-400/80', glow: 'shadow-[0_0_6px_rgba(251,191,36,0.2)]', accent: true },
    { label: t('sidebar.medianPrice'), value: formatPrice(stats.price.median), color: 'bg-emerald-400/70', glow: 'shadow-[0_0_6px_rgba(52,211,153,0.15)]' },
  ]

  return (
    <motion.div
      className="space-y-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.4, ease: EASE_OUT_EXPO }}
    >
      {items.map((item) => (
        <div key={item.label} className="flex justify-between items-center group/stat">
          <span className="text-text-dim text-[11px] flex items-center gap-2.5">
            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0 transition-all duration-300 group-hover/stat:scale-[2.5]', item.color, item.glow)} />
            {item.label}
          </span>
          <span className={cn('text-xs font-semibold tabular-nums', item.accent ? 'text-accent-text' : 'text-text-primary')}>
            {item.value}
          </span>
        </div>
      ))}
    </motion.div>
  )
}

export function Sidebar() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const ctx = useContext(ModelCtx)
  const { theme } = useTheme()

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
        { to: ctx.modelUrl('/settings'), icon: Settings, labelKey: 'nav.settings' },
      ]
    : []
  const allNav = [...primaryNav, ...secondaryNav]

  return (
    <>
      {/* Desktop sidebar — floating panel */}
      <div className="hidden md:block sticky top-0 w-64 shrink-0 pt-3 pl-3 pb-3 z-30 max-h-screen">
      <aside className="flex flex-col max-h-[calc(100vh-1.5rem)] rounded-2xl bg-surface/65 backdrop-blur-2xl backdrop-saturate-[1.15] border border-tint/[0.06] shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.04)] overflow-y-auto overflow-x-hidden">

        {/* Hero image with gradient fade */}
        {ctx?.model.image_url && (
          <div className="relative overflow-hidden rounded-t-2xl">
            <img
              src={ctx.model.image_url}
              alt={`${ctx.model.brand} ${ctx.model.name}`}
              className="w-full h-32 object-cover transition-transform duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:scale-[1.06]"
              style={{ animation: 'zoomIn 0.7s ease-out both' }}
            />
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-surface via-surface/70 to-transparent" />
          </div>
        )}

        {/* Logo + brand — sits on top of the image fade */}
        <motion.div
          className={cn('relative flex items-center gap-3 px-4 pb-3', ctx?.model.image_url ? '-mt-8' : 'pt-5')}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
        >
          <motion.div
            className="w-8 h-8 shrink-0 flex items-center justify-center"
            whileHover={{ scale: 1.1, rotate: -5 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          >
            <svg width="32" height="32" viewBox="0 0 110 110" fill="none" style={{ filter: 'drop-shadow(0 3px 8px rgba(212,168,83,0.25))' }}>
              <defs>
                <linearGradient id="sidebarGauge" x1="0" y1="0" x2="110" y2="110" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#fbbf24"/>
                  <stop offset="100%" stopColor="#d97706"/>
                </linearGradient>
              </defs>
              <circle cx="55" cy="55" r="50" stroke="rgb(from var(--color-tint) r g b / 0.15)" strokeWidth="4" fill="none"/>
              <path d="M 11.7 80 A 50 50 0 1 1 98.3 80" stroke="url(#sidebarGauge)" strokeWidth="4.5" strokeLinecap="round" fill="none"/>
              <line x1="55" y1="5" x2="55" y2="15" stroke="rgb(from var(--color-tint) r g b / 0.25)" strokeWidth="2" strokeLinecap="round"/>
              <line x1="5" y1="55" x2="15" y2="55" stroke="rgb(from var(--color-tint) r g b / 0.25)" strokeWidth="2" strokeLinecap="round"/>
              <line x1="105" y1="55" x2="95" y2="55" stroke="rgb(from var(--color-tint) r g b / 0.25)" strokeWidth="2" strokeLinecap="round"/>
              <line x1="55" y1="55" x2="76" y2="32" stroke="#d4a853" strokeWidth="2.5" strokeLinecap="round"/>
              <circle cx="55" cy="55" r="5.5" fill="#d4a853"/>
              <circle cx="55" cy="55" r="2.5" fill="var(--color-gauge-dot)"/>
            </svg>
          </motion.div>
          <div className="min-w-0">
            {ctx ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.3 }}
              >
                <span className="block text-[9px] text-text-secondary font-medium tracking-[0.15em] uppercase drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">{ctx.model.brand}</span>
                <span className="block font-semibold text-sm tracking-tight text-text-primary drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">{ctx.model.name}</span>
              </motion.div>
            ) : (
              <span className="font-semibold text-[13px] tracking-tight text-text-primary drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">BikeBargain</span>
            )}
          </div>
        </motion.div>

        {/* Back link */}
        {ctx && (
          <div className="px-4 mb-2">
            <NavLink
              to="/?browse=1"
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] text-text-dim hover:text-text-secondary hover:bg-tint/[0.03] transition-all"
            >
              <ArrowLeft className="h-3 w-3" />
              {t('nav.allModels')}
            </NavLink>
          </div>
        )}

        {/* Separator */}
        <div className="h-px bg-gradient-to-r from-transparent via-tint/[0.06] to-transparent mx-4 mb-2" />

        {/* Navigation */}
        <nav className="flex flex-col gap-0.5 px-3 py-2">
          {primaryNav.map((n, i) => (
            <NavItem key={n.to} to={n.to} icon={n.icon} label={t(n.labelKey)} index={i} />
          ))}
          {primaryNav.length > 0 && secondaryNav.length > 0 && (
            <div className="h-px bg-tint/[0.04] mx-3 my-2.5" />
          )}
          {secondaryNav.map((n, i) => (
            <NavItem key={n.to} to={n.to} icon={n.icon} label={t(n.labelKey)} index={i + primaryNav.length} />
          ))}
        </nav>

        {/* Stats */}
        <div className="mt-3 mx-3 rounded-xl bg-gradient-to-b from-tint/[0.04] to-tint/[0.02] border border-tint/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] px-3.5 py-4">
          <SidebarStats />
        </div>

        {/* Spacer to push bottom section down */}
        <div className="flex-1 min-h-4" />

        {/* Bottom separator */}
        <div className="h-px bg-gradient-to-r from-transparent via-tint/[0.08] to-transparent mx-4" />

        {/* Bottom */}
        <div className="px-3 pt-4 pb-4 space-y-3">
          {ctx && (
            <motion.button
              onClick={() => navigate(ctx.modelUrl('/ads?add=true'))}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl w-full bg-gradient-to-b from-amber-500/[0.18] via-amber-500/10 to-amber-600/[0.06] border border-amber-500/20 text-accent-text text-xs font-semibold shadow-[0_2px_8px_rgba(212,168,83,0.08),inset_0_1px_0_rgba(251,191,36,0.1)] hover:from-amber-500/[0.24] hover:via-amber-500/[0.14] hover:to-amber-600/[0.08] hover:border-amber-500/30 hover:shadow-[0_4px_16px_rgba(212,168,83,0.12),inset_0_1px_0_rgba(251,191,36,0.15)] transition-all duration-300"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              <Plus className="h-3.5 w-3.5" />
              {t('sidebar.addAd')}
            </motion.button>
          )}

          <div className="flex items-center justify-between">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>

          {__GIT_BRANCH__ !== 'master' && __GIT_BRANCH__ !== 'main' && (
            <div className="flex items-center justify-center gap-1.5 px-3 py-1 rounded-lg bg-violet-500/10 border border-violet-500/20">
              <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              <span className="text-[10px] text-ui-purple font-mono font-medium truncate">{__GIT_BRANCH__}</span>
            </div>
          )}
        </div>
      </aside>
      </div>

      {/* Mobile bottom nav */}
      <nav
        className={cn(
          'md:hidden fixed bottom-0 left-0 right-0 z-30',
          'bg-bg/65 backdrop-blur-2xl backdrop-saturate-[1.2]',
          'border-t border-tint/[0.06]',
          theme === 'dark'
            ? 'shadow-[0_-8px_40px_rgba(0,0,0,0.45)]'
            : 'shadow-[0_-6px_32px_rgba(120,90,40,0.07)]',
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
                isActive ? 'text-accent-text' : 'text-text-muted active:text-text-secondary',
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
