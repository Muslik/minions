<script setup lang="ts">
import type { Run } from '../../types/run'
import type { Column } from '../../lib/status'
import KanbanColumn from './KanbanColumn.vue'

defineProps<{
  columns: (Column & { runs: Run[] })[]
}>()
</script>

<template>
  <div class="grid grid-cols-5 gap-4">
    <KanbanColumn
      v-for="col in columns"
      :key="col.key"
      :label="col.label"
      :runs="col.runs"
    />
  </div>
</template>
