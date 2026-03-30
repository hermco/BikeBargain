import { motion, useInView } from 'framer-motion'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, ReferenceLine,
} from 'recharts'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useStats } from '../hooks/queries'
import { Card } from '../components/ui/Card'
import { StatCardSkeleton } from '../components/LoadingSkeleton'
import { variantChartColor } from '../lib/utils'
import { useFormatters } from '../hooks/useFormatters'
import { useCurrentModel } from '../hooks/useCurrentModel'
import { AnimatedNumber, EASE_OUT_EXPO } from '../components/animations'
import { Package, TrendingUp, ArrowUpDown, Gauge } from 'lucide-react'

const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(16, 18, 28, 0.92)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
}

const ACCENT_COLORS: Record<string, { hex: string; bg: string; border: string; icon: string }> = {
  blue:    { hex: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.8)',  icon: 'rgba(59,130,246,0.15)'  },
  amber:   { hex: '#d4a853', bg: 'rgba(212,168,83,0.12)',  border: 'rgba(212,168,83,0.8)',  icon: 'rgba(212,168,83,0.15)'  },
  emerald: { hex: '#10b981', bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.8)',  icon: 'rgba(16,185,129,0.15)'  },
  violet:  { hex: '#8b5cf6', bg: 'rgba(139,92,246,0.12)',  border: 'rgba(139,92,246,0.8)',  icon: 'rgba(139,92,246,0.15)'  },
}

function KpiCard({
  label,
  value,
  icon: Icon,
  accent = 'amber',
}: {
  label: string
  value: string
  icon: React.ElementType
  accent?: string
}) {
  const colors = ACCENT_COLORS[accent] ?? ACCENT_COLORS.amber
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true })

  return (
    <Card
      ref={ref}
      className="p-6 relative overflow-hidden group"
      style={{ borderLeft: `4px solid ${colors.border}` }}
    >
      {/* Soft glow in the background — animated */}
      <motion.div
        className="absolute top-0 right-0 w-28 h-28 rounded-full blur-[50px] pointer-events-none"
        style={{ background: colors.bg }}
        animate={isInView ? { scale: [0.8, 1.1, 1], opacity: [0, 1, 0.8] } : {}}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-text-muted uppercase tracking-widest font-semibold mb-2 truncate">
            {label}
          </p>
          <p className="text-3xl font-bold text-text-primary font-fraunces leading-none">
            {value}
          </p>
        </div>
        <motion.div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors duration-300"
          style={{ background: colors.icon }}
          whileHover={{ scale: 1.1, rotate: -5 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
        >
          <Icon className="h-5 w-5" style={{ color: colors.hex }} />
        </motion.div>
      </div>
    </Card>
  )
}

function ChartTitle({ label, dotColor }: { label: string; dotColor: string }) {
  return (
    <div className="flex items-center gap-2 mb-5">
      <span className="relative inline-flex items-center justify-center flex-shrink-0">
        <span
          className="w-2 h-2 rounded-full"
          style={{ background: dotColor }}
        />
        <span
          className="absolute w-2 h-2 rounded-full animate-ping opacity-30"
          style={{ background: dotColor }}
        />
      </span>
      <h2 className="text-[11px] text-text-muted uppercase tracking-widest font-semibold">
        {label}
      </h2>
    </div>
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

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.38, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] as const },
  }),
}

// Gradient bar shape for the accessories chart
function GradientBar(props: {
  x?: number; y?: number; width?: number; height?: number;
  gradientId: string; pct?: number; total?: number
}) {
  const { x = 0, y = 0, width = 0, height = 0, gradientId, pct } = props
  if (!width || !height) return null
  const labelX = x + width + 6
  const labelY = y + height / 2 + 4
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={`url(#${gradientId})`} rx={6} ry={6} />
      {pct != null && width > 24 && (
        <text x={labelX} y={labelY} fill="#8b95a8" fontSize={10} fontWeight={500}>
          {pct}%
        </text>
      )}
    </g>
  )
}

export function StatsPage() {
  const { slug } = useCurrentModel()
  const { data: stats, isLoading } = useStats(slug)
  const { t } = useTranslation()
  const { formatPrice, formatKm } = useFormatters()

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-fraunces">{t('stats.title')}</h1>
          <p className="text-sm text-text-muted mt-1">{t('stats.subtitle')}</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
      </div>
    )
  }

  if (!stats) return null

  const priceHist = buildHistogram(stats.prices_list, 8)
  const kmHist = buildHistogram(stats.mileages_list, 8)

  const variantPriceData = stats.variants
    .filter((v) => v.count > 0)
    .map((v) => ({ name: v.name, count: v.count }))

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
      className="space-y-8"
    >

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight font-fraunces">{t('stats.title')}</h1>
        <p className="text-sm text-text-muted mt-1">{t('stats.subtitle')}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t('stats.ads'),         value: String(stats.count),              icon: Package,    accent: 'blue'    },
          { label: t('stats.avgPrice'),     value: formatPrice(stats.price.mean),    icon: TrendingUp, accent: 'amber'   },
          { label: t('stats.medianPrice'),  value: formatPrice(stats.price.median),  icon: ArrowUpDown,accent: 'emerald' },
          { label: t('stats.avgKm'),        value: formatKm(stats.mileage.mean),     icon: Gauge,      accent: 'violet'  },
        ].map((card, i) => (
          <motion.div key={card.label} custom={i} initial="hidden" animate="visible" variants={cardVariants}>
            <KpiCard {...card} />
          </motion.div>
        ))}
      </div>

      {/* Section divider */}
      <motion.div
        className="border-t border-white/[0.05]"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
      />

      {/* Charts 2x2 grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Price distribution */}
        <motion.div custom={4} initial="hidden" animate="visible" variants={cardVariants}>
          <Card className="p-6">
            <ChartTitle label={t('stats.priceDistribution')} dotColor="#d4a853" />
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={priceHist}>
                <defs>
                  <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d4a853" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#d4a853" stopOpacity={0.4} />
                  </linearGradient>
                </defs>
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
                <Bar dataKey="count" fill="url(#priceGrad)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>

        {/* Mileage distribution */}
        <motion.div custom={5} initial="hidden" animate="visible" variants={cardVariants}>
          <Card className="p-6">
            <ChartTitle label={t('stats.kmDistribution')} dotColor="#3b82f6" />
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={kmHist}>
                <defs>
                  <linearGradient id="kmGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fill: '#5a6478', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#5a6478', fontSize: 11 }} allowDecimals={false} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: '#8b95a8' }} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="count" fill="url(#kmGrad)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>

        {/* Variant distribution */}
        <motion.div custom={6} initial="hidden" animate="visible" variants={cardVariants}>
          <Card className="p-6">
            <ChartTitle label={t('stats.colorDistribution')} dotColor="#8b5cf6" />
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={variantPriceData}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={82}
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
        </motion.div>

        {/* Top departments */}
        <motion.div custom={7} initial="hidden" animate="visible" variants={cardVariants}>
          <Card className="p-4 sm:p-6">
            <ChartTitle label={t('stats.topDepartments')} dotColor="#10b981" />
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.departments} layout="vertical">
                <defs>
                  <linearGradient id="deptGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <XAxis type="number" tick={{ fill: '#5a6478', fontSize: 11 }} allowDecimals={false} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#5a6478', fontSize: 11 }} width={80} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="count" fill="url(#deptGrad)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>
      </div>

      {/* Section divider */}
      <motion.div
        className="border-t border-white/[0.05]"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
      />

      {/* Top accessories */}
      <motion.div custom={8} initial="hidden" animate="visible" variants={cardVariants}>
        <Card className="p-4 sm:p-6">
          <ChartTitle label={t('stats.topAccessories')} dotColor="#d4a853" />
          <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6">
            <div className="min-w-[480px]">
              <svg width="0" height="0" style={{ position: 'absolute' }}>
                <defs>
                  <linearGradient id="accGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#d4a853" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.55} />
                  </linearGradient>
                </defs>
              </svg>
              <ResponsiveContainer width="100%" height={Math.max(stats.top_accessories.length * 32, 120)}>
                <BarChart data={stats.top_accessories} layout="vertical">
                  <XAxis type="number" tick={{ fill: '#5a6478', fontSize: 11 }} unit="%" axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#5a6478', fontSize: 11 }} width={220} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => [`${value}%`, t('stats.frequency')]}
                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  />
                  <Bar
                    dataKey="pct"
                    radius={[0, 6, 6, 0]}
                    shape={(props: { x?: number; y?: number; width?: number; height?: number; pct?: number }) => (
                      <GradientBar gradientId="accGrad" {...props} pct={props.pct} />
                    )}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  )
}
