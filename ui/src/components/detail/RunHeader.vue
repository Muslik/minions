<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import type { Run } from '../../types/run'
import { STATUS_COLORS, STATUS_LABELS } from '../../lib/status'
import { deleteRun } from '../../api/runs'

const props = defineProps<{ run: Run }>()
const router = useRouter()
const queryClient = useQueryClient()
const deleting = ref(false)

const ticketKey = computed(() => {
  return props.run.context.jiraIssue?.key ?? props.run.payload.ticketUrl.split('/browse/').pop() ?? ''
})

const summary = computed(() => props.run.context.jiraIssue?.summary ?? '')

const formatDate = (d: string) => new Date(d).toLocaleString()

const isTerminal = computed(() => ['DONE', 'FAILED', 'ESCALATED'].includes(props.run.status))

async function handleDelete() {
  if (!confirm('Delete this run?')) return
  deleting.value = true
  try {
    await deleteRun(props.run.id)
    queryClient.invalidateQueries({ queryKey: ['runs'] })
    router.push('/')
  } finally {
    deleting.value = false
  }
}
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
      <button
        v-if="isTerminal"
        class="px-3 py-1.5 text-xs rounded-md border border-[hsl(var(--destructive))] text-[hsl(var(--destructive))] hover:bg-red-50 disabled:opacity-50"
        :disabled="deleting"
        @click="handleDelete"
      >
        {{ deleting ? 'Deleting...' : 'Delete' }}
      </button>
    </div>
    <div class="mt-4 flex gap-6 text-xs text-[hsl(var(--muted-foreground))]">
      <span>Created: {{ formatDate(run.createdAt) }}</span>
      <span>Updated: {{ formatDate(run.updatedAt) }}</span>
    </div>
  </div>
</template>
