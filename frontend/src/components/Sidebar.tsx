import { NavLink, useNavigate } from 'react-router-dom'
import { BarChart3, Trophy, LayoutGrid, Plus, Search, Wrench, Globe, ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/utils'
import { useFormatters } from '../hooks/useFormatters'
import { useStats } from '../hooks/queries'
import { useContext } from 'react'
import { ModelCtx } from '../hooks/useCurrentModel'

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

function NavItem({ to, icon: Icon, label }: { to: string; icon: React.ElementType; label: string }) {
  return (
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
          {/* Left accent bar */}
          <span
            className={cn(
              'absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full transition-all duration-200',
              isActive ? 'h-5 bg-amber-400' : 'h-0 bg-amber-400',
            )}
          />
          <Icon
            className={cn(
              'h-[18px] w-[18px] shrink-0 transition-transform duration-200',
              !isActive && 'group-hover:scale-110',
            )}
          />
          <span className="hidden md:inline">{label}</span>
        </>
      )}
    </NavLink>
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
    <div className="mx-3 rounded-xl overflow-hidden border border-white/[0.06] shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
      {/* Colored top accent line */}
      <div className="h-[3px] bg-gradient-to-r from-amber-500/60 via-amber-400/80 to-amber-500/40" />
      <div className="px-4 py-3 bg-white/[0.02]">
        <p className="text-[10px] text-text-dim uppercase tracking-widest font-semibold mb-3">
          {t('sidebar.summary')}
        </p>
        <div className="space-y-2 text-xs">
          {/* Ads count */}
          <div className="flex justify-between items-center">
            <span className="text-text-muted flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400/70 shrink-0" />
              {t('sidebar.ads')}
            </span>
            <span className="text-text-primary font-medium tabular-nums">{stats.count}</span>
          </div>
          {/* Avg price */}
          <div className="flex justify-between items-center">
            <span className="text-text-muted flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80 shrink-0" />
              {t('sidebar.avgPrice')}
            </span>
            <span className="text-amber-300 font-medium tabular-nums">{formatPrice(stats.price.mean)}</span>
          </div>
          {/* Median price */}
          <div className="flex justify-between items-center">
            <span className="text-text-muted flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/70 shrink-0" />
              {t('sidebar.medianPrice')}
            </span>
            <span className="text-text-primary font-medium tabular-nums">{formatPrice(stats.price.median)}</span>
          </div>
        </div>
      </div>
    </div>
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
        <div className="flex items-center gap-3 px-6 pt-7 pb-5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/25 shrink-0">
            <span className="text-bg font-bold text-sm font-fraunces">B</span>
          </div>
          <div>
            <span className="font-semibold text-sm tracking-tight text-text-primary">BikeBargain</span>
            {ctx && (
              <span className="block text-[10px] text-text-muted tracking-widest uppercase">
                {ctx.model.brand} {ctx.model.name}
              </span>
            )}
          </div>
        </div>
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
              {primaryNav.map((n) => (
                <NavItem key={n.to} to={n.to} icon={n.icon} label={t(n.labelKey)} />
              ))}
              <div className="h-px bg-white/[0.04] mx-2 my-1.5" />
            </>
          )}
          {secondaryNav.length > 0 && (
            <>
              <NavSectionLabel label={t('nav.explore')} />
              {secondaryNav.map((n) => (
                <NavItem key={n.to} to={n.to} icon={n.icon} label={t(n.labelKey)} />
              ))}
            </>
          )}
        </nav>

        <div className="mt-4">
          <SidebarStats />
        </div>

        <div className="mt-auto p-4 space-y-3">
          {ctx && (
            <button
              onClick={() => navigate(ctx.modelUrl('/ads?add=true'))}
              className={cn(
                'relative flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl w-full',
                'bg-gradient-to-r from-amber-500 to-amber-600 text-bg text-xs font-semibold',
                'shadow-[0_0_16px_rgba(245,158,11,0.35)] hover:shadow-[0_0_24px_rgba(245,158,11,0.5)]',
                'transition-all duration-200 hover:from-amber-400 hover:to-amber-500 hover:scale-[1.02] active:scale-[0.98]',
              )}
            >
              <Plus className="h-3.5 w-3.5" />
              {t('sidebar.addAd')}
            </button>
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
                <n.icon className={cn('h-5 w-5 transition-transform duration-200', isActive && 'scale-110')} />
                <span>{t(n.labelKey)}</span>
                {/* Active dot indicator */}
                <span
                  className={cn(
                    'absolute bottom-0.5 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 transition-all duration-200',
                    isActive ? 'w-3 h-[3px] opacity-100' : 'w-0 h-[3px] opacity-0',
                  )}
                />
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
