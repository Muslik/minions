<script setup lang="ts">
import { computed } from 'vue'
import { useRuns } from '../composables/useRuns'
import KanbanBoard from '../components/board/KanbanBoard.vue'
import type { Run } from '../types/run'
import { COLUMNS } from '../lib/status'

const { data: runs, isLoading } = useRuns()

const columns = computed(() =>
  COLUMNS.map((col) => ({
    ...col,
    runs: (runs.value ?? []).filter((r: Run) => col.statuses.includes(r.status))
  }))
)
</script>

<template>
  <div v-if="isLoading" class="flex items-center justify-center py-20 text-[hsl(var(--muted-foreground))]">
    Loading runs...
  </div>
  <KanbanBoard v-else :columns="columns" />
</template>
