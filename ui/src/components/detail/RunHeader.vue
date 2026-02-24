<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import type { Run } from '../../types/run'
import { STATUS_COLORS, STATUS_LABELS } from '../../lib/status'
import { deleteRun, rerunRun } from '../../api/runs'

const props = defineProps<{ run: Run }>()
const router = useRouter()
const queryClient = useQueryClient()
const deleting = ref(false)
const rerunning = ref(false)
const showRerun = ref(false)
const rerunMode = ref<'full' | 'reuse_plan'>('full')
const rerunComment = ref('')

const ticketKey = computed(() => {
  return props.run.context.jiraIssue?.key ?? props.run.payload.ticketUrl.split('/browse/').pop() ?? ''
})

const summary = computed(() => props.run.context.jiraIssue?.summary ?? '')

const formatDate = (d: string) => new Date(d).toLocaleString()

const isTerminal = computed(() => ['DONE', 'FAILED', 'ESCALATED'].includes(props.run.status))
const canReusePlan = computed(() => Boolean(props.run.plan?.trim()))

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

async function handleRerun() {
  const mode = rerunMode.value === 'reuse_plan' && !canReusePlan.value ? 'full' : rerunMode.value
  rerunning.value = true
  try {
    const { runId } = await rerunRun(props.run.id, {
      mode,
      comment: rerunComment.value.trim() || undefined
    })
    queryClient.invalidateQueries({ queryKey: ['runs'] })
    queryClient.invalidateQueries({ queryKey: ['run', props.run.id] })
    showRerun.value = false
    rerunComment.value = ''
    router.push(`/runs/${runId}`)
  } catch (e: any) {
    if (e?.status === 409 && e?.body?.existingRun?.id) {
      if (confirm('Active run already exists for this ticket. Open it?')) {
        router.push(`/runs/${e.body.existingRun.id}`)
      }
      return
    }
    alert(e?.body?.error || e?.message || 'Failed to rerun')
  } finally {
    rerunning.value = false
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
      <div v-if="isTerminal" class="flex items-center gap-2">
        <button
          class="px-3 py-1.5 text-xs rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] disabled:opacity-50"
          :disabled="rerunning || deleting"
          @click="showRerun = !showRerun"
        >
          Re-run
        </button>
        <button
          class="px-3 py-1.5 text-xs rounded-md border border-[hsl(var(--destructive))] text-[hsl(var(--destructive))] hover:bg-red-50 disabled:opacity-50"
          :disabled="deleting || rerunning"
          @click="handleDelete"
        >
          {{ deleting ? 'Deleting...' : 'Delete' }}
        </button>
      </div>
    </div>
    <div v-if="showRerun && isTerminal" class="mt-4 rounded-md border border-[hsl(var(--border))] p-3 space-y-3">
      <div class="text-xs font-medium">Re-run mode</div>
      <div class="flex flex-col gap-1 text-sm">
        <label class="inline-flex items-center gap-2">
          <input v-model="rerunMode" type="radio" value="full" />
          <span>Full re-run (hydrate + plan + approval)</span>
        </label>
        <label class="inline-flex items-center gap-2" :class="{ 'opacity-50': !canReusePlan }">
          <input v-model="rerunMode" type="radio" value="reuse_plan" :disabled="!canReusePlan" />
          <span>Reuse previous plan (skip planning/approval)</span>
        </label>
      </div>
      <div>
        <label class="block text-xs font-medium mb-1">Comment (optional)</label>
        <textarea
          v-model="rerunComment"
          rows="3"
          class="w-full rounded-md border border-[hsl(var(--input))] bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
          placeholder="Extra context for this re-run"
        />
      </div>
      <div class="flex items-center gap-2">
        <button
          class="px-3 py-1.5 text-xs rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50"
          :disabled="rerunning"
          @click="handleRerun"
        >
          {{ rerunning ? 'Starting...' : 'Start Re-run' }}
        </button>
        <button
          class="px-3 py-1.5 text-xs rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] disabled:opacity-50"
          :disabled="rerunning"
          @click="showRerun = false"
        >
          Close
        </button>
      </div>
    </div>
    <div class="mt-4 flex gap-6 text-xs text-[hsl(var(--muted-foreground))]">
      <span>Created: {{ formatDate(run.createdAt) }}</span>
      <span>Updated: {{ formatDate(run.updatedAt) }}</span>
    </div>
  </div>
</template>
