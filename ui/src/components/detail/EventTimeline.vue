<script setup lang="ts">
import type { RunEvent } from '../../types/run'

defineProps<{ events: RunEvent[] }>()

const formatTime = (d: string) => new Date(d).toLocaleTimeString()
</script>

<template>
  <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
    <h2 class="text-sm font-semibold mb-4">Event Timeline</h2>
    <div v-if="events.length === 0" class="text-sm text-[hsl(var(--muted-foreground))]">
      No events yet
    </div>
    <div v-else class="space-y-3">
      <div
        v-for="event in events"
        :key="event.id"
        class="flex gap-3 text-sm"
      >
        <span class="text-xs text-[hsl(var(--muted-foreground))] whitespace-nowrap mt-0.5">
          {{ formatTime(event.createdAt) }}
        </span>
        <div>
          <span class="font-medium">{{ event.type }}</span>
          <pre v-if="event.data" class="text-xs text-[hsl(var(--muted-foreground))] mt-1 overflow-x-auto">{{ typeof event.data === 'string' ? event.data : JSON.stringify(event.data, null, 2) }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
