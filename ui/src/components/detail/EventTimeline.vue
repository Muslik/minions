<script setup lang="ts">
import { computed } from 'vue'
import type { RunEvent } from '../../types/run'

const props = defineProps<{ events: RunEvent[] }>()

const formatTime = (d: string) => new Date(d).toLocaleTimeString()

const isError = (event: RunEvent) => event.type === 'error'

const eventMessage = (event: RunEvent) => {
  if (!event.data) return ''
  const d = event.data as Record<string, unknown>
  if (typeof d === 'string') return d
  if (d.message) return String(d.message)
  return JSON.stringify(d, null, 2)
}

const sortedEvents = computed(() => [...props.events].reverse())
</script>

<template>
  <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
    <h2 class="text-sm font-semibold mb-4">Event Timeline</h2>
    <div v-if="events.length === 0" class="text-sm text-[hsl(var(--muted-foreground))]">
      No events yet
    </div>
    <div v-else class="space-y-2">
      <div
        v-for="event in sortedEvents"
        :key="event.id"
        class="flex gap-3 text-sm rounded-md p-2 -mx-2"
        :class="isError(event) ? 'bg-red-50' : ''"
      >
        <span class="text-xs text-[hsl(var(--muted-foreground))] whitespace-nowrap mt-0.5 tabular-nums">
          {{ formatTime(event.createdAt) }}
        </span>
        <div class="min-w-0 flex-1">
          <span
            class="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium"
            :class="isError(event) ? 'bg-red-100 text-red-700' : 'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]'"
          >
            {{ event.type }}
          </span>
          <p
            v-if="eventMessage(event)"
            class="mt-1 text-xs text-[hsl(var(--muted-foreground))] break-words whitespace-pre-wrap"
          >{{ eventMessage(event) }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
