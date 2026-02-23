<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { Run } from '../../types/run'
import { STATUS_COLORS, STATUS_LABELS } from '../../lib/status'

const props = defineProps<{ run: Run }>()

const ticketKey = computed(() => {
  const issue = props.run.context.jiraIssue
  if (issue?.key) return issue.key
  const url = props.run.payload.ticketUrl
  const match = url.match(/\/browse\/(.+)$/)
  return match?.[1] ?? url
})

const summary = computed(() => props.run.context.jiraIssue?.summary)

const timeAgo = computed(() => {
  const diff = Date.now() - new Date(props.run.createdAt).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
})
</script>

<template>
  <RouterLink :to="`/runs/${run.id}`" class="block">
    <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
      <div class="flex items-start justify-between gap-2 mb-2">
        <span class="font-mono text-xs font-medium text-[hsl(var(--primary))]">{{ ticketKey }}</span>
        <span
          class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
          :class="STATUS_COLORS[run.status]"
        >
          {{ STATUS_LABELS[run.status] }}
        </span>
      </div>
      <p v-if="summary" class="text-sm text-[hsl(var(--foreground))] line-clamp-2 mb-2">{{ summary }}</p>
      <p class="text-xs text-[hsl(var(--muted-foreground))]">{{ timeAgo }}</p>
    </div>
  </RouterLink>
</template>
