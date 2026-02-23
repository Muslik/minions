<script setup lang="ts">
import { ref } from 'vue'
import { resumeRun } from '../../api/runs'
import { useQueryClient } from '@tanstack/vue-query'

const props = defineProps<{ runId: string }>()
const queryClient = useQueryClient()
const showRevise = ref(false)
const comment = ref('')
const loading = ref(false)

async function handleAction(action: 'approve' | 'revise' | 'cancel') {
  loading.value = true
  try {
    await resumeRun(props.runId, action, action === 'revise' ? comment.value : undefined)
    queryClient.invalidateQueries({ queryKey: ['run', props.runId] })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="rounded-lg border-2 border-amber-300 bg-amber-50 p-6">
    <h2 class="text-sm font-semibold mb-4 text-amber-800">Awaiting Your Approval</h2>
    <div v-if="showRevise" class="mb-4">
      <textarea
        v-model="comment"
        placeholder="Describe what needs to change..."
        class="w-full rounded-md border border-[hsl(var(--input))] bg-white px-3 py-2 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
      />
    </div>
    <div class="flex gap-2">
      <button
        class="px-4 py-2 text-sm rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
        :disabled="loading"
        @click="handleAction('approve')"
      >
        Approve
      </button>
      <button
        v-if="!showRevise"
        class="px-4 py-2 text-sm rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
        :disabled="loading"
        @click="showRevise = true"
      >
        Revise
      </button>
      <button
        v-else
        class="px-4 py-2 text-sm rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
        :disabled="loading || !comment.trim()"
        @click="handleAction('revise')"
      >
        Send Revision
      </button>
      <button
        class="px-4 py-2 text-sm rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] disabled:opacity-50"
        :disabled="loading"
        @click="handleAction('cancel')"
      >
        Cancel Run
      </button>
    </div>
  </div>
</template>
