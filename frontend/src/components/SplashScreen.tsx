import { useEffect } from 'react'
import { motion } from 'framer-motion'

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const

/**
 * Gauge splash screen.
 *
 * The gauge arc spans from 7-o'clock (bottom-left, 0 rpm)
 * to 5-o'clock (bottom-right, redline).
 * That's ~240° of arc, opening at the bottom.
 *
 * Needle rotation in CSS degrees (0° = up, clockwise positive):
 *   - 7-o'clock  = -120°  (idle)
 *   - 12-o'clock =    0°  (mid-range)
 *   - 2-o'clock  =  +60°  (high revs — final position)
 *
 * The needle sweeps from -120° → +60° (= 180° clockwise).
 */

const NEEDLE_START = -120 // 7 o'clock — idle
const NEEDLE_END = 60     // 2 o'clock — high revs

export function SplashScreen({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500)
    return () => clearTimeout(t)
  }, [onDone])

  // Gauge size in px
  const SIZE = 180

  return (
    <motion.div
      key="splash"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-bg"
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
    >
      {/* Ambient glow */}
      <motion.div
        className="absolute w-[500px] h-[500px] rounded-full bg-amber-500/[0.05] blur-[120px]"
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
      />

      <div className="relative">
        {/* SVG gauge (no needle — needle is a separate div for reliable rotation) */}
        <svg width={SIZE} height={SIZE} viewBox="0 0 110 110" fill="none">
          <defs>
            <linearGradient id="splashGauge" x1="0" y1="0" x2="110" y2="110" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#fbbf24"/>
              <stop offset="100%" stopColor="#d97706"/>
            </linearGradient>
          </defs>

          {/* Background circle */}
          <motion.circle
            cx="55" cy="55" r="50"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="3"
            fill="none"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
          />

          {/* Arc — draws in from left (idle) to right (redline) */}
          <motion.path
            d="M 18.4 80 A 50 50 0 1 1 91.6 80"
            stroke="url(#splashGauge)"
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.4, ease: EASE_OUT_EXPO, delay: 0.2 }}
          />

          {/* Tick marks — ordered around the arc from left to right */}
          {[
            { x1: 9, y1: 55, x2: 17, y2: 55 },
            { x1: 19, y1: 27, x2: 24, y2: 31 },
            { x1: 55, y1: 9, x2: 55, y2: 17 },
            { x1: 91, y1: 27, x2: 86, y2: 31 },
            { x1: 101, y1: 55, x2: 93, y2: 55 },
          ].map((tick, i) => (
            <motion.line
              key={i}
              x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2}
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="2"
              strokeLinecap="round"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 + i * 0.1, duration: 0.3 }}
            />
          ))}

          {/* Center pivot */}
          <motion.circle
            cx="55" cy="55" r="6"
            fill="#d4a853"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3, type: 'spring', stiffness: 400, damping: 12 }}
          />
          <motion.circle
            cx="55" cy="55" r="3"
            fill="#0c0f14"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.4, type: 'spring', stiffness: 400, damping: 12 }}
          />
        </svg>

        {/*
          Needle as an absolutely positioned div, rotating via CSS transform.
          This is a thin bar anchored at its bottom (center of the gauge)
          that rotates around that bottom anchor point.
        */}
        <motion.div
          style={{
            position: 'absolute',
            // Position the needle's rotation anchor at the gauge center
            left: SIZE / 2,
            top: SIZE / 2,
            // The needle extends upward from the anchor
            width: 3,
            height: SIZE * 0.36, // ~40% of gauge radius
            marginLeft: -1.5,    // center the 3px width
            marginTop: -(SIZE * 0.36), // extend upward from anchor
            transformOrigin: 'bottom center',
            borderRadius: 2,
            background: '#d4a853',
          }}
          initial={{ rotate: NEEDLE_START, opacity: 0 }}
          animate={{ rotate: NEEDLE_END, opacity: 1 }}
          transition={{
            rotate: {
              duration: 1.6,
              ease: [0.25, 0.1, 0.25, 1], // smooth ease-out
              delay: 0.5,
            },
            opacity: { duration: 0.15, delay: 0.5 },
          }}
        />

        {/* Text below */}
        <motion.p
          className="text-center mt-5 text-[13px] font-medium tracking-[0.25em] uppercase text-text-dim"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.5, duration: 0.5, ease: EASE_OUT_EXPO }}
        >
          BikeBargain
        </motion.p>
      </div>
    </motion.div>
  )
}
