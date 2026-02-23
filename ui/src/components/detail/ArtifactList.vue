<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { fetchArtifacts } from '../../api/runs'

const props = defineProps<{ runId: string }>()
const { data: artifacts } = useQuery({
  queryKey: ['artifacts', props.runId],
  queryFn: () => fetchArtifacts(props.runId)
})
</script>

<template>
  <div v-if="artifacts?.length" class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
    <h2 class="text-sm font-semibold mb-4">Artifacts</h2>
    <ul class="space-y-1">
      <li v-for="name in artifacts" :key="name">
        <a
          :href="`/api/v1/runs/${runId}/artifacts/${name}`"
          target="_blank"
          class="text-sm text-[hsl(var(--primary))] hover:underline"
        >
          {{ name }}
        </a>
      </li>
    </ul>
  </div>
</template>
