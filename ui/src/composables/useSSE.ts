import { onUnmounted } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'

export function useSSE() {
  const queryClient = useQueryClient()
  const es = new EventSource('/api/v1/events/stream')

  es.addEventListener('status', () => {
    queryClient.invalidateQueries({ queryKey: ['runs'] })
    queryClient.invalidateQueries({ queryKey: ['run'] })
  })

  es.addEventListener('run-event', () => {
    queryClient.invalidateQueries({ queryKey: ['run-events'] })
  })

  es.onerror = () => {
    // EventSource auto-reconnects
  }

  onUnmounted(() => es.close())
}
