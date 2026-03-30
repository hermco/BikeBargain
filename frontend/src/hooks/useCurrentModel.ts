import { createContext, useContext } from 'react'
import type { BikeModelDetail, BikeVariant } from '../types'

export interface ModelContext {
  slug: string
  model: BikeModelDetail
  variants: BikeVariant[]
  modelUrl: (path: string) => string
}

export const ModelCtx = createContext<ModelContext | null>(null)

export function useCurrentModel() {
  const ctx = useContext(ModelCtx)
  if (!ctx) throw new Error('useCurrentModel must be used within ModelLayout')
  return ctx
}

/** Get variant-specific colors from the model context */
export function useVariantOptions() {
  const { variants } = useCurrentModel()
  const variantNames = [...new Set(variants.map((v) => v.variant_name))]
  const wheelTypes = [...new Set(variants.map((v) => v.wheel_type))]

  function colorsForVariant(variantName: string | null): string[] {
    if (!variantName) return [...new Set(variants.map((v) => v.color))]
    return variants.filter((v) => v.variant_name === variantName).map((v) => v.color)
  }

  function variantColor(variantName: string | null): string {
    if (!variantName) return 'bg-white/[0.06] text-text-muted'
    const v = variants.find((vr) => vr.variant_name === variantName)
    if (v?.color_hex) {
      return `bg-[${v.color_hex}]/15 text-[${v.color_hex}]`
    }
    // Fallback — generate from variant name hash
    return 'bg-white/[0.06] text-text-muted'
  }

  function variantChartColor(variantName: string): string {
    const v = variants.find((vr) => vr.variant_name === variantName)
    return v?.color_hex ?? '#6b7280'
  }

  return { variantNames, wheelTypes, colorsForVariant, variantColor, variantChartColor, variants }
}
