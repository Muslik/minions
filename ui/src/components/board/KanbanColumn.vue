<script setup lang="ts">
import type { Run } from '../../types/run'
import RunCard from './RunCard.vue'

const props = defineProps<{
  label: string
  runs: Run[]
}>()
</script>

<template>
  <div class="flex-shrink-0 w-72">
    <div class="flex items-center justify-between mb-3 px-1">
      <h3 class="font-semibold text-sm text-[hsl(var(--foreground))]">{{ label }}</h3>
      <span class="text-xs text-[hsl(var(--muted-foreground))] bg-[hsl(var(--secondary))] rounded-full px-2 py-0.5">
        {{ props.runs.length }}
      </span>
    </div>
    <div class="space-y-2">
      <RunCard v-for="run in props.runs" :key="run.id" :run="run" />
      <div
        v-if="props.runs.length === 0"
        class="text-center py-8 text-xs text-[hsl(var(--muted-foreground))] border border-dashed border-[hsl(var(--border))] rounded-lg"
      >
        No runs
      </div>
    </div>
  </div>
</template>
