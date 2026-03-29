import { motion } from 'framer-motion'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, ReferenceLine,
} from 'recharts'
import { useTranslation } from 'react-i18next'
import { useStats } from '../hooks/queries'
import { Card } from '../components/ui/Card'
import { StatCardSkeleton } from '../components/LoadingSkeleton'
import { variantChartColor } from '../lib/utils'
import { useFormatters } from '../hooks/useFormatters'
import { useCurrentModel } from '../hooks/useCurrentModel'
import { Package, TrendingUp, ArrowUpDown, Gauge } from 'lucide-react'

const TOOLTIP_STYLE = {
  backgroundColor: '#161a22',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
}

function KpiCard({ label, value, icon: Icon, accent }: { label: string; value: string; icon: React.ElementType; accent?: string }) {
  return (
    <Card className="p-6 relative overflow-hidden">
      <div className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-[40px] opacity-[0.07] ${accent ?? 'bg-amber-500'}`} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] text-text-muted uppercase tracking-widest font-semibold mb-2">{label}</p>
          <p className="text-2xl font-bold text-text-primary font-fraunces">{value}</p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center">
          <Icon className="h-5 w-5 text-text-dim" />
        </div>
      </div>
    </Card>
  )
}

function buildHistogram(values: number[], bins: number): { label: string; count: number }[] {
  if (values.length === 0) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  const step = (max - min) / bins || 1
  const buckets = Array.from({ length: bins }, (_, i) => ({
    label: `${Math.round(min + i * step)}`,
    count: 0,
  }))
  for (const v of values) {
    const idx = Math.min(Math.floor((v - min) / step), bins - 1)
    buckets[idx].count++
  }
  return buckets
}

export function StatsPage() {
  const { slug } = useCurrentModel()
  const { data: stats, isLoading } = useStats(slug)
  const { t } = useTranslation()
  const { formatPrice, formatKm } = useFormatters()

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight font-fraunces">{t('stats.title')}</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
      </div>
    )
  }

  if (!stats) return null

  const priceHist = buildHistogram(stats.prices_list, 8)
  const kmHist = buildHistogram(stats.mileages_list, 8)

  // Compute average price per variant from raw data
  const variantPriceData = stats.variants
    .filter((v) => v.count > 0)
    .map((v) => ({ name: v.name, count: v.count }))

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t('stats.title')}</h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label={t('stats.ads')} value={String(stats.count)} icon={Package} accent="bg-blue-500" />
        <KpiCard label={t('stats.avgPrice')} value={formatPrice(stats.price.mean)} icon={TrendingUp} accent="bg-amber-500" />
        <KpiCard label={t('stats.medianPrice')} value={formatPrice(stats.price.median)} icon={ArrowUpDown} accent="bg-emerald-500" />
        <KpiCard label={t('stats.avgKm')} value={formatKm(stats.mileage.mean)} icon={Gauge} accent="bg-violet-500" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-6">
          <h2 className="text-[11px] text-text-muted uppercase tracking-widest font-semibold mb-5">{t('stats.priceDistribution')}</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={priceHist}>
              <XAxis dataKey="label" tick={{ fill: '#5a6478', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#5a6478', fontSize: 11 }} allowDecimals={false} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: '#8b95a8' }} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              {stats.price.median != null && (
                <ReferenceLine
                  x={String(Math.round(stats.price.median))}
                  stroke="#d4a853"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{ value: `${t('stats.median')}: ${formatPrice(stats.price.median)}`, position: 'top', fill: '#d4a853', fontSize: 10 }}
                />
              )}
              <Bar dataKey="count" fill="#d4a853" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-6">
          <h2 className="text-[11px] text-text-muted uppercase tracking-widest font-semibold mb-5">{t('stats.kmDistribution')}</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={kmHist}>
              <XAxis dataKey="label" tick={{ fill: '#5a6478', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#5a6478', fontSize: 11 }} allowDecimals={false} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: '#8b95a8' }} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="count" fill="#3b82f6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-6">
          <h2 className="text-[11px] text-text-muted uppercase tracking-widest font-semibold mb-5">{t('stats.variantDistribution')}</h2>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={variantPriceData}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={75}
                paddingAngle={3}
                strokeWidth={0}
                label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
              >
                {variantPriceData.map((entry) => (
                  <Cell key={entry.name} fill={variantChartColor(entry.name)} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4 sm:p-6">
          <h2 className="text-[11px] text-text-muted uppercase tracking-widest font-semibold mb-5">{t('stats.topDepartments')}</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={stats.departments} layout="vertical">
              <XAxis type="number" tick={{ fill: '#5a6478', fontSize: 11 }} allowDecimals={false} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#5a6478', fontSize: 11 }} width={80} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="count" fill="#10b981" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Top accessories */}
      <Card className="p-4 sm:p-6">
        <h2 className="text-[11px] text-text-muted uppercase tracking-widest font-semibold mb-5">
          {t('stats.topAccessories')}
        </h2>
        <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6">
          <div className="min-w-[480px]">
            <ResponsiveContainer width="100%" height={Math.max(stats.top_accessories.length * 32, 120)}>
              <BarChart data={stats.top_accessories} layout="vertical">
                <XAxis type="number" tick={{ fill: '#5a6478', fontSize: 11 }} unit="%" axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#5a6478', fontSize: 11 }} width={220} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value) => [`${value}%`, t('stats.frequency')]}
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                />
                <Bar dataKey="pct" fill="#d4a853" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>
    </motion.div>
  )
}
