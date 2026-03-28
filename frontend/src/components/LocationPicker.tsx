import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { MapPin, X } from 'lucide-react'
import { geocodeSearch, type UserLocation, type GeoSuggestion } from '../lib/geo'

interface LocationPickerProps {
  location: UserLocation | null
  onChange: (loc: UserLocation | null) => void
}

export function LocationPicker({ location, onChange }: LocationPickerProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Fermer le dropdown si clic en dehors
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false)
        setSuggestions([])
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const doSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.length < 2) {
      setSuggestions([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      const results = await geocodeSearch(q)
      setSuggestions(results)
      setLoading(false)
    }, 300)
  }, [])

  function handleSelect(s: GeoSuggestion) {
    const loc: UserLocation = { label: s.label, lat: s.lat, lng: s.lng }
    onChange(loc)
    setFocused(false)
    setQuery('')
    setSuggestions([])
  }

  function handleClear() {
    onChange(null)
    setQuery('')
    setSuggestions([])
    inputRef.current?.focus()
  }

  function handleFocus() {
    setFocused(true)
    setQuery('')
  }

  const displayValue = focused ? query : (location?.label ?? '')
  const placeholder = location ? location.label : t('common.yourCity')

  return (
    <div ref={containerRef} className="relative max-w-xs">
      <div className="flex items-center gap-2 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2 focus-within:ring-2 focus-within:ring-amber-500/30 focus-within:border-amber-500/30 transition-all">
        <MapPin className={`h-4 w-4 shrink-0 ${location ? 'text-amber-400' : 'text-text-dim'}`} />
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={displayValue}
          onChange={(e) => {
            setQuery(e.target.value)
            doSearch(e.target.value)
          }}
          onFocus={handleFocus}
          className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-dim outline-none min-w-0"
        />
        {loading && (
          <div className="h-3.5 w-3.5 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin shrink-0" />
        )}
        {location && !focused && (
          <button
            onClick={handleClear}
            className="p-0.5 rounded-md hover:bg-white/[0.06] text-text-dim hover:text-red-400 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-1.5 w-full rounded-xl bg-[#1a1d24] border border-white/[0.08] shadow-2xl shadow-black/40 overflow-hidden"
          >
            {suggestions.map((s, i) => (
              <button
                key={`${s.postcode}-${s.city}-${i}`}
                onClick={() => handleSelect(s)}
                className="w-full text-left px-3 py-2.5 text-sm text-text-secondary hover:bg-white/[0.06] hover:text-text-primary transition-colors flex items-center gap-2.5 border-b border-white/[0.04] last:border-0"
              >
                <MapPin className="h-3.5 w-3.5 text-text-dim shrink-0" />
                <span>{s.label}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
