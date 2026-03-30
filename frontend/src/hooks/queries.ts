import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '../lib/api'

export function useAds(params?: Parameters<typeof api.fetchAds>[0]) {
  return useQuery({
    queryKey: ['ads', params],
    queryFn: () => api.fetchAds(params),
  })
}

export function useAd(id: number) {
  return useQuery({
    queryKey: ['ad', id],
    queryFn: () => api.fetchAd(id),
  })
}

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: api.fetchStats,
  })
}

export function useRankings() {
  return useQuery({
    queryKey: ['rankings'],
    queryFn: api.fetchRankings,
  })
}

export function usePreviewAd() {
  return useMutation({
    mutationFn: (url: string) => api.previewAd(url),
  })
}

export function useConfirmAd() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (adData: Record<string, unknown>) => api.confirmAd(adData),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ads'] })
      void qc.invalidateQueries({ queryKey: ['stats'] })
      void qc.invalidateQueries({ queryKey: ['rankings'] })
    },
  })
}

export function useAddAd() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (url: string) => api.addAd(url),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ads'] })
      void qc.invalidateQueries({ queryKey: ['stats'] })
      void qc.invalidateQueries({ queryKey: ['rankings'] })
    },
  })
}

export function useUpdateAd() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Parameters<typeof api.updateAd>[1] & { id: number }) =>
      api.updateAd(id, data),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['ad', vars.id] })
      void qc.invalidateQueries({ queryKey: ['ads'] })
      void qc.invalidateQueries({ queryKey: ['stats'] })
      void qc.invalidateQueries({ queryKey: ['rankings'] })
    },
  })
}

export function useRefreshAllAccessories() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.refreshAllAccessories(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ads'] })
      void qc.invalidateQueries({ queryKey: ['stats'] })
      void qc.invalidateQueries({ queryKey: ['rankings'] })
    },
  })
}

export function useRefreshAdAccessories() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (adId: number) => api.refreshAdAccessories(adId),
    onSuccess: (_data, adId) => {
      void qc.invalidateQueries({ queryKey: ['ad', adId] })
      void qc.invalidateQueries({ queryKey: ['ads'] })
      void qc.invalidateQueries({ queryKey: ['stats'] })
      void qc.invalidateQueries({ queryKey: ['rankings'] })
    },
  })
}

export function useMergeAd() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ newAdData, oldAdId }: { newAdData: Record<string, unknown>; oldAdId: number }) =>
      api.mergeAd(newAdData, oldAdId),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ['ads'] })
      void qc.invalidateQueries({ queryKey: ['ad', data.id] })
      void qc.invalidateQueries({ queryKey: ['ad', data.old_ad_id] })
      void qc.invalidateQueries({ queryKey: ['stats'] })
      void qc.invalidateQueries({ queryKey: ['rankings'] })
      void qc.invalidateQueries({ queryKey: ['price-history', data.id] })
      void qc.invalidateQueries({ queryKey: ['price-history', data.old_ad_id] })
      void qc.invalidateQueries({ queryKey: ['crawl-session'] })
    },
  })
}

export function usePriceHistory(adId: number) {
  return useQuery({
    queryKey: ['price-history', adId],
    queryFn: () => api.fetchPriceHistory(adId),
    enabled: adId > 0,
  })
}

export function useMarkAdSold() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, sold }: { id: number; sold: boolean }) => api.markAdSold(id, sold),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['ad', vars.id] })
      void qc.invalidateQueries({ queryKey: ['ads'] })
      void qc.invalidateQueries({ queryKey: ['stats'] })
      void qc.invalidateQueries({ queryKey: ['rankings'] })
    },
  })
}

export function useCheckAdsOnline() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.checkAdsOnline(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ads'] })
      void qc.invalidateQueries({ queryKey: ['stats'] })
      void qc.invalidateQueries({ queryKey: ['rankings'] })
    },
  })
}

export function useCheckAdOnline() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.checkAdOnline(id),
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: ['ad', id] })
      void qc.invalidateQueries({ queryKey: ['ads'] })
      void qc.invalidateQueries({ queryKey: ['rankings'] })
    },
  })
}

export function useDeleteAd() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteAd(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ads'] })
      void qc.invalidateQueries({ queryKey: ['stats'] })
      void qc.invalidateQueries({ queryKey: ['rankings'] })
    },
  })
}

export function useCheckPrices() {
  return useMutation({
    mutationFn: () => api.checkPrices(),
  })
}

export function useConfirmPrice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ adId, newPrice }: { adId: number; newPrice: number }) =>
      api.confirmPrice(adId, newPrice),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['ad', vars.adId] })
      void qc.invalidateQueries({ queryKey: ['ads'] })
      void qc.invalidateQueries({ queryKey: ['stats'] })
      void qc.invalidateQueries({ queryKey: ['rankings'] })
      void qc.invalidateQueries({ queryKey: ['price-history', vars.adId] })
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

// ─── Crawl ────────────────────────────────────────────────────────────────

export function useActiveCrawlSession() {
  return useQuery({
    queryKey: ['crawl-session'],
    queryFn: api.fetchActiveCrawlSession,
    retry: false,
  })
}

export function useCrawlSearch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.crawlSearch(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['crawl-session'] })
    },
  })
}

export function useCrawlExtract() {
  return useMutation({
    mutationFn: ({ adId, url }: { adId: number; url: string }) =>
      api.crawlExtract(adId, url),
  })
}

export function useCrawlConfirm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (adData: Record<string, unknown>) => api.confirmAd(adData),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ads'] })
      void qc.invalidateQueries({ queryKey: ['stats'] })
      void qc.invalidateQueries({ queryKey: ['rankings'] })
    },
  })
}

export function useUpdateCrawlAdAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, adId, action }: { sessionId: number; adId: number; action: string }) =>
      api.updateCrawlAdAction(sessionId, adId, action),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['crawl-session'] })
    },
  })
}

export function useCloseCrawlSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: number) => api.closeCrawlSession(sessionId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['crawl-session'] })
    },
  })
}

export function useRemoveCrawlSessionAd() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, adId }: { sessionId: number; adId: number }) =>
      api.removeCrawlSessionAd(sessionId, adId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['crawl-session'] })
    },
  })
}
