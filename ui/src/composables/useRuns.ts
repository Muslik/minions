import { useQuery } from '@tanstack/vue-query'
import { fetchRuns } from '../api/runs'

export function useRuns() {
  return useQuery({
    queryKey: ['runs'],
    queryFn: fetchRuns,
    refetchInterval: 30_000
  })
}
