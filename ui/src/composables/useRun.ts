import { useQuery } from '@tanstack/vue-query'
import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import { fetchRun } from '../api/runs'

export function useRun(id: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => ['run', toValue(id)]),
    queryFn: () => fetchRun(toValue(id))
  })
}
