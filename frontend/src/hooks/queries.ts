import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { SearchConfig, ListingStatus } from '../types'
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

export function useUpdateAdStatus(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, listing_status }: { id: number; listing_status: ListingStatus }) => api.updateAdStatus(slug, id, listing_status),
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

export function useCheckAdsOnlineFull(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.checkAdsOnlineFull(slug),
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

export function useStatusHistory(slug: string, adId: number) {
  return useQuery({
    queryKey: ['status-history', slug, adId],
    queryFn: () => api.fetchStatusHistory(slug, adId),
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

// ─── Catalog V2 ──────────────────────────────────────────────────────────

export function useCatalogGroups() {
  return useQuery({
    queryKey: ['catalog-groups'],
    queryFn: api.fetchCatalogGroups,
    staleTime: 30_000,
  })
}

export function useCatalogGroup(id: number) {
  return useQuery({
    queryKey: ['catalog-group', id],
    queryFn: () => api.fetchCatalogGroup(id),
    enabled: id > 0,
  })
}

export function useCreateCatalogGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createCatalogGroup,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['catalog-groups'] })
      void qc.invalidateQueries({ queryKey: ['ads'] })
      void qc.invalidateQueries({ queryKey: ['rankings'] })
    },
  })
}

export function useUpdateCatalogGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Parameters<typeof api.updateCatalogGroup>[1]) =>
      api.updateCatalogGroup(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['catalog-groups'] })
      void qc.invalidateQueries({ queryKey: ['ads'] })
      void qc.invalidateQueries({ queryKey: ['rankings'] })
    },
  })
}

export function useDeleteCatalogGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.deleteCatalogGroup,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['catalog-groups'] })
      void qc.invalidateQueries({ queryKey: ['ads'] })
      void qc.invalidateQueries({ queryKey: ['rankings'] })
    },
  })
}

export function useCreateCatalogVariant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, ...data }: { groupId: number } & Parameters<typeof api.createCatalogVariant>[1]) =>
      api.createCatalogVariant(groupId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['catalog-groups'] })
      void qc.invalidateQueries({ queryKey: ['ads'] })
      void qc.invalidateQueries({ queryKey: ['rankings'] })
    },
  })
}

export function useUpdateCatalogVariant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Partial<api.CatalogVariant>) =>
      api.updateCatalogVariant(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['catalog-groups'] })
      void qc.invalidateQueries({ queryKey: ['ads'] })
      void qc.invalidateQueries({ queryKey: ['rankings'] })
    },
  })
}

export function useDeleteCatalogVariant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.deleteCatalogVariant,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['catalog-groups'] })
      void qc.invalidateQueries({ queryKey: ['ads'] })
      void qc.invalidateQueries({ queryKey: ['rankings'] })
    },
  })
}

export function useSuggestSynonyms() {
  return useMutation({
    mutationFn: api.suggestSynonyms,
  })
}

export function usePreviewRegex() {
  return useMutation({
    mutationFn: api.previewRegex,
  })
}

export function usePreviewDiff() {
  return useMutation({
    mutationFn: api.previewDiff,
  })
}

export function useTestOnAd() {
  return useMutation({
    mutationFn: api.testOnAd,
  })
}

export function useResetCatalog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.resetCatalog,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['catalog-groups'] })
      void qc.invalidateQueries({ queryKey: ['ads'] })
      void qc.invalidateQueries({ queryKey: ['rankings'] })
    },
  })
}

export function useExportCatalog() {
  return useMutation({
    mutationFn: api.exportCatalog,
  })
}

export function useImportCatalog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.importCatalog,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['catalog-groups'] })
      void qc.invalidateQueries({ queryKey: ['ads'] })
      void qc.invalidateQueries({ queryKey: ['rankings'] })
    },
  })
}

export function useRefreshStatus() {
  return useQuery({
    queryKey: ['refresh-status'],
    queryFn: api.fetchRefreshStatus,
    refetchInterval: (query) => {
      const data = query.state.data
      return data?.status === 'running' ? 2000 : false
    },
  })
}

// ─── Search Configs ───────────────────────────────────────────────────────

export function useSearchConfigs(slug: string) {
  return useQuery({
    queryKey: ['search-configs', slug],
    queryFn: () => api.fetchSearchConfigs(slug),
    staleTime: 30_000,
  })
}

export function useCreateSearchConfig(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<SearchConfig, 'id'>) => api.createSearchConfig(slug, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['search-configs', slug] })
    },
  })
}

export function useUpdateSearchConfig(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Omit<SearchConfig, 'id'>> }) =>
      api.updateSearchConfig(slug, id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['search-configs', slug] })
    },
  })
}

export function useDeleteSearchConfig(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteSearchConfig(slug, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['search-configs', slug] })
    },
  })
}

export function useLbcEnums() {
  return useQuery({
    queryKey: ['lbc-enums'],
    queryFn: api.fetchLbcEnums,
    staleTime: Infinity,
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

export function useCrawlSession(slug: string, sessionId: number | null) {
  return useQuery({
    queryKey: ['crawl-session', slug, sessionId],
    queryFn: () => api.fetchCrawlSession(slug, sessionId!),
    retry: false,
    enabled: !!slug && sessionId != null,
  })
}

export function useRedetectAccessories(slug: string) {
  return useMutation({
    mutationFn: (body: string) => api.redetectAccessories(slug, body),
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
