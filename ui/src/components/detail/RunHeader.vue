<script setup lang="ts">
import { computed } from 'vue'
import type { Run } from '../../types/run'
import { STATUS_COLORS, STATUS_LABELS } from '../../lib/status'

const props = defineProps<{ run: Run }>()

const ticketKey = computed(() => {
  return props.run.context.jiraIssue?.key ?? props.run.payload.ticketUrl.split('/browse/').pop() ?? ''
})

const summary = computed(() => props.run.context.jiraIssue?.summary ?? '')

const formatDate = (d: string) => new Date(d).toLocaleString()
</script>

<template>
  <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
    <div class="flex items-start justify-between">
      <div>
        <div class="flex items-center gap-3 mb-2">
          <a
            :href="run.payload.ticketUrl"
            target="_blank"
            rel="noopener"
            class="font-mono text-sm font-medium text-[hsl(var(--primary))] hover:underline"
          >
            {{ ticketKey }}
          </a>
          <span
            class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
            :class="STATUS_COLORS[run.status]"
          >
            {{ STATUS_LABELS[run.status] }}
          </span>
        </div>
        <h1 class="text-xl font-semibold">{{ summary }}</h1>
      </div>
    </div>
    <div class="mt-4 flex gap-6 text-xs text-[hsl(var(--muted-foreground))]">
      <span>Created: {{ formatDate(run.createdAt) }}</span>
      <span>Updated: {{ formatDate(run.updatedAt) }}</span>
    </div>
  </div>
</template>
