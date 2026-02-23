<script setup lang="ts">
import { computed, ref } from 'vue'
import type { RunEvent } from '../../types/run'

const props = defineProps<{ events: RunEvent[] }>()

const formatTime = (d: string) => new Date(d).toLocaleTimeString()

const isError = (event: RunEvent) => event.type === 'error'
const isToolCall = (event: RunEvent) => event.type === 'tool_call'
const isToolResult = (event: RunEvent) => event.type === 'tool_result'
const isToolEvent = (event: RunEvent) => isToolCall(event) || isToolResult(event)

const toolName = (event: RunEvent) => {
  const d = event.data as Record<string, unknown> | undefined
  return d?.tool ? String(d.tool) : ''
}

const toolInput = (event: RunEvent) => {
  const d = event.data as Record<string, unknown> | undefined
  if (!d?.input) return ''
  return typeof d.input === 'string' ? d.input : JSON.stringify(d.input, null, 2)
}

const toolOutput = (event: RunEvent) => {
  const d = event.data as Record<string, unknown> | undefined
  return d?.output ? String(d.output) : ''
}

const eventMessage = (event: RunEvent) => {
  if (!event.data) return ''
  if (isToolEvent(event)) return ''
  const d = event.data as Record<string, unknown>
  if (typeof d === 'string') return d
  if (d.message) return String(d.message)
  return JSON.stringify(d, null, 2)
}

const expanded = ref<Set<number>>(new Set())
const toggle = (id: number) => {
  if (expanded.value.has(id)) expanded.value.delete(id)
  else expanded.value.add(id)
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
          <!-- Tool call event -->
          <template v-if="isToolCall(event)">
            <button
              class="flex items-center gap-1.5 cursor-pointer"
              @click="toggle(event.id)"
            >
              <span class="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700">
                {{ toolName(event) }}
              </span>
              <span class="text-xs text-[hsl(var(--muted-foreground))]">called</span>
              <span class="text-xs text-[hsl(var(--muted-foreground))]">{{ expanded.has(event.id) ? '▾' : '▸' }}</span>
            </button>
            <pre
              v-if="expanded.has(event.id) && toolInput(event)"
              class="mt-1 text-xs bg-[hsl(var(--secondary))] rounded p-2 overflow-x-auto max-h-48 whitespace-pre-wrap break-words"
            >{{ toolInput(event) }}</pre>
          </template>

          <!-- Tool result event -->
          <template v-else-if="isToolResult(event)">
            <button
              class="flex items-center gap-1.5 cursor-pointer"
              @click="toggle(event.id)"
            >
              <span class="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-green-100 text-green-700">
                {{ toolName(event) }}
              </span>
              <span class="text-xs text-[hsl(var(--muted-foreground))]">result</span>
              <span class="text-xs text-[hsl(var(--muted-foreground))]">{{ expanded.has(event.id) ? '▾' : '▸' }}</span>
            </button>
            <pre
              v-if="expanded.has(event.id) && toolOutput(event)"
              class="mt-1 text-xs bg-[hsl(var(--secondary))] rounded p-2 overflow-x-auto max-h-48 whitespace-pre-wrap break-words"
            >{{ toolOutput(event) }}</pre>
          </template>

          <!-- Default event rendering -->
          <template v-else>
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
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
