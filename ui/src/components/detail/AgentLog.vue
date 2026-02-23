<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import type { RunEvent } from '../../types/run'

const props = defineProps<{ events: RunEvent[] }>()

const container = ref<HTMLElement>()
const autoScroll = ref(true)

const entries = computed(() => {
  return props.events.map((e) => {
    const d = e.data as Record<string, unknown> | undefined
    const time = new Date(e.createdAt).toLocaleTimeString()

    if (e.type === 'status_change') {
      return { id: e.id, time, kind: 'status' as const, text: String(d?.status ?? '') }
    }
    if (e.type === 'tool_call') {
      const tool = String(d?.tool ?? '')
      const input = d?.input
      const summary = typeof input === 'string'
        ? input.slice(0, 120)
        : input ? JSON.stringify(input).slice(0, 120) : ''
      return { id: e.id, time, kind: 'tool_call' as const, text: tool, detail: summary }
    }
    if (e.type === 'tool_result') {
      const tool = String(d?.tool ?? '')
      const output = String(d?.output ?? '').slice(0, 200)
      return { id: e.id, time, kind: 'tool_result' as const, text: tool, detail: output }
    }
    if (e.type === 'agent_text') {
      return { id: e.id, time, kind: 'agent_text' as const, text: String(d?.text ?? '').slice(0, 300) }
    }
    if (e.type === 'error') {
      return { id: e.id, time, kind: 'error' as const, text: String(d?.message ?? JSON.stringify(d)) }
    }
    return { id: e.id, time, kind: 'other' as const, text: e.type, detail: d?.message ? String(d.message) : undefined }
  })
})

const expanded = ref<Set<number>>(new Set())
const toggle = (id: number) => {
  if (expanded.value.has(id)) expanded.value.delete(id)
  else expanded.value.add(id)
}

watch(() => props.events.length, async () => {
  if (!autoScroll.value) return
  await nextTick()
  if (container.value) {
    container.value.scrollTop = container.value.scrollHeight
  }
})

function onScroll() {
  if (!container.value) return
  const { scrollTop, scrollHeight, clientHeight } = container.value
  autoScroll.value = scrollHeight - scrollTop - clientHeight < 40
}
</script>

<template>
  <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
    <div class="px-4 py-3 border-b border-[hsl(var(--border))] flex items-center justify-between">
      <h2 class="text-sm font-semibold">Agent Log</h2>
      <span class="text-xs text-[hsl(var(--muted-foreground))] tabular-nums">{{ events.length }} events</span>
    </div>
    <div
      ref="container"
      class="overflow-y-auto max-h-[420px] font-mono text-xs leading-relaxed"
      @scroll="onScroll"
    >
      <div
        v-for="entry in entries"
        :key="entry.id"
        class="flex gap-2 px-4 py-1 hover:bg-[hsl(var(--secondary)/0.5)] border-b border-[hsl(var(--border)/0.3)]"
      >
        <span class="text-[hsl(var(--muted-foreground))] whitespace-nowrap shrink-0 tabular-nums select-none">
          {{ entry.time }}
        </span>

        <!-- Status change -->
        <div v-if="entry.kind === 'status'" class="flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"></span>
          <span class="text-amber-600">{{ entry.text }}</span>
        </div>

        <!-- Tool call -->
        <div v-else-if="entry.kind === 'tool_call'" class="min-w-0 flex-1">
          <button class="flex items-center gap-1.5 cursor-pointer" @click="toggle(entry.id)">
            <span class="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0"></span>
            <span class="text-blue-600 font-medium">{{ entry.text }}</span>
            <span class="text-[hsl(var(--muted-foreground))]">called</span>
            <span class="text-[hsl(var(--muted-foreground))]">{{ expanded.has(entry.id) ? '▾' : '▸' }}</span>
          </button>
          <pre
            v-if="expanded.has(entry.id) && entry.detail"
            class="mt-1 ml-3 text-[10px] bg-[hsl(var(--secondary))] rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap break-all text-[hsl(var(--muted-foreground))]"
          >{{ entry.detail }}</pre>
        </div>

        <!-- Tool result -->
        <div v-else-if="entry.kind === 'tool_result'" class="min-w-0 flex-1">
          <button class="flex items-center gap-1.5 cursor-pointer" @click="toggle(entry.id)">
            <span class="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0"></span>
            <span class="text-green-600 font-medium">{{ entry.text }}</span>
            <span class="text-[hsl(var(--muted-foreground))]">result</span>
            <span class="text-[hsl(var(--muted-foreground))]">{{ expanded.has(entry.id) ? '▾' : '▸' }}</span>
          </button>
          <pre
            v-if="expanded.has(entry.id) && entry.detail"
            class="mt-1 ml-3 text-[10px] bg-[hsl(var(--secondary))] rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap break-all text-[hsl(var(--muted-foreground))]"
          >{{ entry.detail }}</pre>
        </div>

        <!-- Agent text -->
        <div v-else-if="entry.kind === 'agent_text'" class="min-w-0 flex-1">
          <div class="flex items-start gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0 mt-1"></span>
            <span class="text-[hsl(var(--foreground))] break-words">{{ entry.text }}</span>
          </div>
        </div>

        <!-- Error -->
        <div v-else-if="entry.kind === 'error'" class="flex items-start gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 mt-1"></span>
          <span class="text-red-600 break-words">{{ entry.text }}</span>
        </div>

        <!-- Other -->
        <div v-else class="flex items-start gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0 mt-1"></span>
          <span class="text-[hsl(var(--muted-foreground))]">{{ entry.text }}</span>
          <span v-if="entry.detail" class="text-[hsl(var(--muted-foreground))] truncate">{{ entry.detail }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
