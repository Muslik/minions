import { useQuery } from '@tanstack/vue-query'
import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import { fetchRunEvents } from '../api/runs'

export function useRunEvents(id: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => ['run-events', toValue(id)]),
    queryFn: () => fetchRunEvents(toValue(id)),
    refetchInterval: 10_000
  })
}
