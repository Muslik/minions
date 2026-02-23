<script setup lang="ts">
import { useRun } from '../composables/useRun'
import { useRunEvents } from '../composables/useRunEvents'
import RunHeader from '../components/detail/RunHeader.vue'
import PlanViewer from '../components/detail/PlanViewer.vue'
import ApprovalPanel from '../components/detail/ApprovalPanel.vue'
import ClarifyPanel from '../components/detail/ClarifyPanel.vue'
import AgentLog from '../components/detail/AgentLog.vue'
import ArtifactList from '../components/detail/ArtifactList.vue'
import PrLink from '../components/detail/PrLink.vue'

const props = defineProps<{ id: string }>()
const { data: run, isLoading } = useRun(() => props.id)
const { data: events } = useRunEvents(() => props.id)
</script>

<template>
  <div v-if="isLoading" class="flex items-center justify-center py-20 text-[hsl(var(--muted-foreground))]">
    Loading run...
  </div>
  <div v-else-if="run" class="max-w-4xl mx-auto space-y-6">
    <RouterLink to="/" class="inline-flex items-center gap-1 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
      &larr; Back to board
    </RouterLink>
    <RunHeader :run="run" />
    <PrLink v-if="run.context.prUrl" :url="run.context.prUrl as string" />
    <ClarifyPanel v-if="run.status === 'CLARIFYING' && run.questions?.length" :run-id="run.id" :questions="run.questions" />
    <ApprovalPanel v-if="run.status === 'AWAITING_APPROVAL'" :run-id="run.id" />
    <PlanViewer v-if="run.plan" :plan="run.plan" />
    <ArtifactList :run-id="run.id" />
    <AgentLog v-if="events?.length" :events="events" />
  </div>
  <div v-else class="text-center py-20 text-[hsl(var(--muted-foreground))]">
    Run not found
  </div>
</template>
