<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import type { RunEvent } from '../../types/run'
import { STATUS_COLORS, STATUS_LABELS } from '../../lib/status'
import type { RunStatus } from '../../types/run'

const props = defineProps<{ events: RunEvent[] }>()

interface ToolEntry {
  id: number
  time: string
  kind: 'tool_call' | 'tool_result' | 'agent_text' | 'error' | 'other'
  tool?: string
  detail?: string
  text?: string
}

interface Phase {
  status: string
  time: string
  entries: ToolEntry[]
}

const phases = computed(() => {
  const result: Phase[] = []
  let current: Phase | null = null

  for (const e of props.events) {
    const d = e.data as Record<string, unknown> | undefined
    const time = new Date(e.createdAt).toLocaleTimeString()

    if (e.type === 'status_change') {
      current = { status: String(d?.status ?? ''), time, entries: [] }
      result.push(current)
      continue
    }

    if (!current) {
      current = { status: 'INIT', time, entries: [] }
      result.push(current)
    }

    if (e.type === 'tool_call') {
      const tool = String(d?.tool ?? '')
      const input = d?.input
      const detail = typeof input === 'string' ? input.slice(0, 200) : input ? JSON.stringify(input).slice(0, 200) : ''
      current.entries.push({ id: e.id, time, kind: 'tool_call', tool, detail })
    } else if (e.type === 'tool_result') {
      const tool = String(d?.tool ?? '')
      const detail = String(d?.output ?? '').slice(0, 300)
      current.entries.push({ id: e.id, time, kind: 'tool_result', tool, detail })
    } else if (e.type === 'agent_text') {
      current.entries.push({ id: e.id, time, kind: 'agent_text', text: String(d?.text ?? '').slice(0, 400) })
    } else if (e.type === 'error') {
      current.entries.push({ id: e.id, time, kind: 'error', text: String(d?.message ?? JSON.stringify(d)) })
    } else {
      const detail = formatOtherEventDetail(d)
      current.entries.push({ id: e.id, time, kind: 'other', text: e.type, detail })
    }
  }

  return result
})

const collapsedPhases = ref<Set<number>>(new Set())
const expandedEntries = ref<Set<number>>(new Set())

function togglePhase(idx: number) {
  if (collapsedPhases.value.has(idx)) collapsedPhases.value.delete(idx)
  else collapsedPhases.value.add(idx)
}

function toggleEntry(id: number) {
  if (expandedEntries.value.has(id)) expandedEntries.value.delete(id)
  else expandedEntries.value.add(id)
}

const container = ref<HTMLElement>()
const autoScroll = ref(true)

watch(() => props.events.length, async () => {
  if (!autoScroll.value) return
  await nextTick()
  if (container.value) container.value.scrollTop = container.value.scrollHeight
})

function onScroll() {
  if (!container.value) return
  const { scrollTop, scrollHeight, clientHeight } = container.value
  autoScroll.value = scrollHeight - scrollTop - clientHeight < 40
}

function statusColor(status: string): string {
  return STATUS_COLORS[status as RunStatus] ?? 'bg-gray-100 text-gray-700'
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status as RunStatus] ?? status
}

function toolCallCount(entries: ToolEntry[]): number {
  return entries.filter(e => e.kind === 'tool_call').length
}

function formatOtherEventDetail(data: Record<string, unknown> | undefined): string {
  if (!data) return ''
  try {
    return JSON.stringify(data, null, 2).slice(0, 1500)
  } catch {
    return String(data)
  }
}
</script>

<template>
  <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
    <div class="px-4 py-3 border-b border-[hsl(var(--border))] flex items-center justify-between">
      <h2 class="text-sm font-semibold">Agent Log</h2>
      <span class="text-xs text-[hsl(var(--muted-foreground))] tabular-nums">{{ events.length }} events</span>
    </div>
    <div ref="container" class="overflow-y-auto max-h-[500px]" @scroll="onScroll">
      <div v-for="(phase, idx) in phases" :key="idx" class="border-b border-[hsl(var(--border)/0.3)]">
        <!-- Phase header -->
        <button
          class="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-[hsl(var(--secondary)/0.5)] cursor-pointer"
          @click="togglePhase(idx)"
        >
          <span class="text-xs text-[hsl(var(--muted-foreground))] tabular-nums whitespace-nowrap font-mono">
            {{ phase.time }}
          </span>
          <span
            class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
            :class="statusColor(phase.status)"
          >
            {{ statusLabel(phase.status) }}
          </span>
          <span v-if="phase.entries.length" class="text-xs text-[hsl(var(--muted-foreground))]">
            {{ toolCallCount(phase.entries) }} calls
          </span>
          <span v-if="phase.entries.length" class="ml-auto text-xs text-[hsl(var(--muted-foreground))]">
            {{ !collapsedPhases.has(idx) ? '▾' : '▸' }}
          </span>
        </button>

        <!-- Phase entries -->
        <div v-if="!collapsedPhases.has(idx) && phase.entries.length" class="mx-4 mb-3 rounded bg-[hsl(var(--secondary)/0.5)] border border-[hsl(var(--border)/0.3)]">
          <div
            v-for="entry in phase.entries"
            :key="entry.id"
            class="flex gap-2 px-3 py-1 text-xs font-mono border-b border-[hsl(var(--border)/0.2)] last:border-b-0"
          >
            <span class="text-[hsl(var(--muted-foreground))] whitespace-nowrap tabular-nums select-none shrink-0">
              {{ entry.time }}
            </span>

            <!-- Tool call -->
            <div v-if="entry.kind === 'tool_call'" class="min-w-0 flex-1">
              <button class="flex items-center gap-1 cursor-pointer" @click="toggleEntry(entry.id)">
                <span class="text-blue-600 font-medium">{{ entry.tool }}</span>
                <span class="text-[hsl(var(--muted-foreground))]">{{ expandedEntries.has(entry.id) ? '▾' : '▸' }}</span>
              </button>
              <pre
                v-if="expandedEntries.has(entry.id) && entry.detail"
                class="mt-1 text-[10px] bg-[hsl(var(--card))] rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap break-all text-[hsl(var(--muted-foreground))]"
              >{{ entry.detail }}</pre>
            </div>

            <!-- Tool result -->
            <div v-else-if="entry.kind === 'tool_result'" class="min-w-0 flex-1">
              <button class="flex items-center gap-1 cursor-pointer" @click="toggleEntry(entry.id)">
                <span class="text-green-600">{{ entry.tool }}</span>
                <span class="text-[hsl(var(--muted-foreground))]">result {{ expandedEntries.has(entry.id) ? '▾' : '▸' }}</span>
              </button>
              <pre
                v-if="expandedEntries.has(entry.id) && entry.detail"
                class="mt-1 text-[10px] bg-[hsl(var(--card))] rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap break-all text-[hsl(var(--muted-foreground))]"
              >{{ entry.detail }}</pre>
            </div>

            <!-- Agent text -->
            <div v-else-if="entry.kind === 'agent_text'" class="min-w-0 flex-1">
              <span class="text-violet-600 break-words">{{ entry.text }}</span>
            </div>

            <!-- Error -->
            <div v-else-if="entry.kind === 'error'" class="min-w-0 flex-1">
              <span class="text-red-600 break-words">{{ entry.text }}</span>
            </div>

            <!-- Other -->
            <div v-else class="min-w-0 flex-1">
              <button class="flex items-center gap-1 cursor-pointer" @click="toggleEntry(entry.id)">
                <span class="text-[hsl(var(--muted-foreground))]">{{ entry.text }}</span>
                <span v-if="entry.detail" class="text-[hsl(var(--muted-foreground))]">{{ expandedEntries.has(entry.id) ? '▾' : '▸' }}</span>
              </button>
              <pre
                v-if="expandedEntries.has(entry.id) && entry.detail"
                class="mt-1 text-[10px] bg-[hsl(var(--card))] rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap break-all text-[hsl(var(--muted-foreground))]"
              >{{ entry.detail }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
