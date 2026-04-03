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

/** Get color/wheel options from the model context */
export function useVariantOptions() {
  const { variants } = useCurrentModel()
  const colorNames = [...new Set(variants.map((v) => v.color))]
  const wheelTypes = [...new Set(variants.map((v) => v.wheel_type))]

  function wheelTypesForColor(color: string | null): string[] {
    if (!color) return wheelTypes
    return variants.filter((v) => v.color === color).map((v) => v.wheel_type)
  }

  return { colorNames, wheelTypes, wheelTypesForColor, variants }
}
