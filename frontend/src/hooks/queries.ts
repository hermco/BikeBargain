import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '../lib/api'

// ─── Bike Models ─────────────────────────────────────────────────────────────

export function useBikeModels() {
  return useQuery({
    queryKey: ['bike-models'],
    queryFn: api.fetchBikeModels,
  })
}

export function useBikeModel(slug: string) {
  return useQuery({
    queryKey: ['bike-model', slug],
    queryFn: () => api.fetchBikeModel(slug),
    enabled: !!slug,
  })
}

export function useBikeVariants(slug: string) {
  return useQuery({
    queryKey: ['bike-variants', slug],
    queryFn: () => api.fetchBikeVariants(slug),
    enabled: !!slug,
  })
}

// ─── Ads ─────────────────────────────────────────────────────────────────────

export function useAds(slug: string, params?: Parameters<typeof api.fetchAds>[1]) {
  return useQuery({
    queryKey: ['ads', slug, params],
    queryFn: () => api.fetchAds(slug, params),
    enabled: !!slug,
  })
}

export function useAd(slug: string, id: number) {
  return useQuery({
    queryKey: ['ad', slug, id],
    queryFn: () => api.fetchAd(slug, id),
    enabled: !!slug && id > 0,
  })
}

export function useStats(slug: string) {
  return useQuery({
    queryKey: ['stats', slug],
    queryFn: () => api.fetchStats(slug),
    enabled: !!slug,
  })
}

export function useRankings(slug: string) {
  return useQuery({
    queryKey: ['rankings', slug],
    queryFn: () => api.fetchRankings(slug),
    enabled: !!slug,
  })
}

export function usePreviewAd(slug: string) {
  return useMutation({
    mutationFn: (url: string) => api.previewAd(slug, url),
  })
}

export function useConfirmAd(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (adData: Record<string, unknown>) => api.confirmAd(slug, adData),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ads', slug] })
      void qc.invalidateQueries({ queryKey: ['stats', slug] })
      void qc.invalidateQueries({ queryKey: ['rankings', slug] })
      void qc.invalidateQueries({ queryKey: ['bike-models'] })
    },
  })
}

export function useAddAd(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (url: string) => api.addAd(slug, url),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ads', slug] })
      void qc.invalidateQueries({ queryKey: ['stats', slug] })
      void qc.invalidateQueries({ queryKey: ['rankings', slug] })
      void qc.invalidateQueries({ queryKey: ['bike-models'] })
    },
  })
}

export function useUpdateAd(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Parameters<typeof api.updateAd>[2] & { id: number }) =>
      api.updateAd(slug, id, data),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['ad', slug, vars.id] })
      void qc.invalidateQueries({ queryKey: ['ads', slug] })
      void qc.invalidateQueries({ queryKey: ['stats', slug] })
      void qc.invalidateQueries({ queryKey: ['rankings', slug] })
    },
  })
}

export function useAccessoryCatalog(slug: string) {
  return useQuery({
    queryKey: ['accessory-catalog', slug],
    queryFn: () => api.fetchAccessoryCatalog(slug),
    staleTime: 30_000,
    enabled: !!slug,
  })
}

export function useUpdateCatalogPrice(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ group, estimated_new_price }: { group: string; estimated_new_price: number }) =>
      api.updateCatalogPrice(slug, group, estimated_new_price),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['accessory-catalog', slug] })
      void qc.invalidateQueries({ queryKey: ['ads', slug] })
      void qc.invalidateQueries({ queryKey: ['rankings', slug] })
      void qc.invalidateQueries({ queryKey: ['stats', slug] })
    },
  })
}

export function useResetCatalogPrice(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (group: string) => api.resetCatalogPrice(slug, group),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['accessory-catalog', slug] })
      void qc.invalidateQueries({ queryKey: ['ads', slug] })
      void qc.invalidateQueries({ queryKey: ['rankings', slug] })
      void qc.invalidateQueries({ queryKey: ['stats', slug] })
    },
  })
}

export function useRefreshAllAccessories(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.refreshAllAccessories(slug),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ads', slug] })
      void qc.invalidateQueries({ queryKey: ['stats', slug] })
      void qc.invalidateQueries({ queryKey: ['rankings', slug] })
    },
  })
}

export function useRefreshAdAccessories(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (adId: number) => api.refreshAdAccessories(slug, adId),
    onSuccess: (_data, adId) => {
      void qc.invalidateQueries({ queryKey: ['ad', slug, adId] })
      void qc.invalidateQueries({ queryKey: ['ads', slug] })
      void qc.invalidateQueries({ queryKey: ['stats', slug] })
      void qc.invalidateQueries({ queryKey: ['rankings', slug] })
    },
  })
}

export function useMergeAd(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ newAdData, oldAdId }: { newAdData: Record<string, unknown>; oldAdId: number }) =>
      api.mergeAd(slug, newAdData, oldAdId),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ['ads', slug] })
      void qc.invalidateQueries({ queryKey: ['ad', slug, data.id] })
      void qc.invalidateQueries({ queryKey: ['ad', slug, data.old_ad_id] })
      void qc.invalidateQueries({ queryKey: ['stats', slug] })
      void qc.invalidateQueries({ queryKey: ['rankings', slug] })
      void qc.invalidateQueries({ queryKey: ['price-history', slug, data.id] })
      void qc.invalidateQueries({ queryKey: ['price-history', slug, data.old_ad_id] })
      void qc.invalidateQueries({ queryKey: ['crawl-session', slug] })
      void qc.invalidateQueries({ queryKey: ['bike-models'] })
    },
  })
}

export function usePriceHistory(slug: string, adId: number) {
  return useQuery({
    queryKey: ['price-history', slug, adId],
    queryFn: () => api.fetchPriceHistory(slug, adId),
    enabled: !!slug && adId > 0,
  })
}

export function useMarkAdSold(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, sold }: { id: number; sold: boolean }) => api.markAdSold(slug, id, sold),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['ad', slug, vars.id] })
      void qc.invalidateQueries({ queryKey: ['ads', slug] })
      void qc.invalidateQueries({ queryKey: ['stats', slug] })
      void qc.invalidateQueries({ queryKey: ['rankings', slug] })
    },
  })
}

export function useCheckAdsOnline(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.checkAdsOnline(slug),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ads', slug] })
      void qc.invalidateQueries({ queryKey: ['stats', slug] })
      void qc.invalidateQueries({ queryKey: ['rankings', slug] })
    },
  })
}

export function useCheckAdOnline(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.checkAdOnline(slug, id),
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: ['ad', slug, id] })
      void qc.invalidateQueries({ queryKey: ['ads', slug] })
      void qc.invalidateQueries({ queryKey: ['rankings', slug] })
    },
  })
}

export function useDeleteAd(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteAd(slug, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ads', slug] })
      void qc.invalidateQueries({ queryKey: ['stats', slug] })
      void qc.invalidateQueries({ queryKey: ['rankings', slug] })
      void qc.invalidateQueries({ queryKey: ['bike-models'] })
    },
  })
}

export function useCheckPrices(slug: string) {
  return useMutation({
    mutationFn: () => api.checkPrices(slug),
  })
}

export function useConfirmPrice(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ adId, newPrice }: { adId: number; newPrice: number }) =>
      api.confirmPrice(slug, adId, newPrice),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['ad', slug, vars.adId] })
      void qc.invalidateQueries({ queryKey: ['ads', slug] })
      void qc.invalidateQueries({ queryKey: ['stats', slug] })
      void qc.invalidateQueries({ queryKey: ['rankings', slug] })
      void qc.invalidateQueries({ queryKey: ['price-history', slug, vars.adId] })
    },
  })
}

// ─── Crawl ────────────────────────────────────────────────────────────────

export function useActiveCrawlSession(slug: string) {
  return useQuery({
    queryKey: ['crawl-session', slug],
    queryFn: () => api.fetchActiveCrawlSession(slug),
    retry: false,
    enabled: !!slug,
  })
}

export function useCrawlSearch(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.crawlSearch(slug),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['crawl-session', slug] })
    },
  })
}

export function useCrawlExtract(slug: string) {
  return useMutation({
    mutationFn: ({ adId, url }: { adId: number; url: string }) =>
      api.crawlExtract(slug, adId, url),
  })
}

export function useCrawlConfirm(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (adData: Record<string, unknown>) => api.confirmAd(slug, adData),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ads', slug] })
      void qc.invalidateQueries({ queryKey: ['stats', slug] })
      void qc.invalidateQueries({ queryKey: ['rankings', slug] })
      void qc.invalidateQueries({ queryKey: ['bike-models'] })
    },
  })
}

export function useUpdateCrawlAdAction(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, adId, action }: { sessionId: number; adId: number; action: string }) =>
      api.updateCrawlAdAction(slug, sessionId, adId, action),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['crawl-session', slug] })
    },
  })
}

export function useCloseCrawlSession(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: number) => api.closeCrawlSession(slug, sessionId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['crawl-session', slug] })
    },
  })
}

export function useRemoveCrawlSessionAd(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, adId }: { sessionId: number; adId: number }) =>
      api.removeCrawlSessionAd(slug, sessionId, adId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['crawl-session', slug] })
    },
  })
}
