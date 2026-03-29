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
          'flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
          isActive
            ? 'bg-gradient-to-r from-amber-500/15 to-amber-500/5 text-amber-300 shadow-[inset_0_0_0_1px_rgba(212,168,83,0.15)]'
            : 'text-text-muted hover:text-text-secondary hover:bg-white/[0.03]',
        )
      }
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      <span className="hidden md:inline">{label}</span>
    </NavLink>
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
    <div className="px-4 py-3 mx-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
      <p className="text-[10px] text-text-dim uppercase tracking-widest font-semibold mb-2">{t('sidebar.summary')}</p>
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-text-muted">{t('sidebar.ads')}</span>
          <span className="text-text-primary font-medium">{stats.count}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">{t('sidebar.avgPrice')}</span>
          <span className="text-amber-300 font-medium">{formatPrice(stats.price.mean)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">{t('sidebar.medianPrice')}</span>
          <span className="text-text-primary font-medium">{formatPrice(stats.price.median)}</span>
        </div>
      </div>
    </div>
  )
}

export function Sidebar() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const ctx = useContext(ModelCtx)

  const navKeys = ctx
    ? [
        { to: ctx.modelUrl('/ads'), icon: LayoutGrid, labelKey: 'nav.ads' },
        { to: ctx.modelUrl('/stats'), icon: BarChart3, labelKey: 'nav.stats' },
        { to: ctx.modelUrl('/rankings'), icon: Trophy, labelKey: 'nav.ranking' },
        { to: ctx.modelUrl('/crawl'), icon: Search, labelKey: 'nav.search' },
        { to: ctx.modelUrl('/catalog'), icon: Wrench, labelKey: 'nav.accessories' },
      ]
    : []

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-60 flex-col bg-bg/80 backdrop-blur-xl border-r border-white/[0.06] z-30">
        <div className="flex items-center gap-3 px-6 py-6">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
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

        {ctx && (
          <div className="px-4 mb-2">
            <NavLink
              to="/"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] text-text-dim hover:text-text-secondary hover:bg-white/[0.03] transition-all"
            >
              <ArrowLeft className="h-3 w-3" />
              {t('nav.allModels')}
            </NavLink>
          </div>
        )}

        <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent mx-4" />
        <nav className="flex flex-col gap-1 p-3 mt-3">
          {navKeys.map((n) => (
            <NavItem key={n.to} to={n.to} icon={n.icon} label={t(n.labelKey)} />
          ))}
        </nav>

        <div className="mt-4">
          <SidebarStats />
        </div>

        <div className="mt-auto p-4 space-y-3">
          {ctx && (
            <button
              onClick={() => navigate(ctx.modelUrl('/ads?add=true'))}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 text-amber-300 text-xs font-medium hover:bg-amber-500/15 transition-colors border border-amber-500/15 w-full"
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

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-bg/90 backdrop-blur-xl border-t border-white/[0.06] z-30 flex justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] px-4">
        {navKeys.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to.endsWith('/ads')}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-1 px-4 py-1.5 text-[10px] font-medium rounded-xl transition-all',
                isActive ? 'text-amber-300' : 'text-text-muted',
              )
            }
          >
            <n.icon className="h-5 w-5" />
            <span>{t(n.labelKey)}</span>
          </NavLink>
        ))}
      </nav>
    </>
  )
}
