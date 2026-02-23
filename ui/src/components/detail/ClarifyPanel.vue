<script setup lang="ts">
import { ref } from 'vue'
import { resumeRun } from '../../api/runs'
import { useQueryClient } from '@tanstack/vue-query'

const props = defineProps<{ runId: string; questions: string[] }>()
const queryClient = useQueryClient()
const answers = ref<string[]>(props.questions.map(() => ''))
const loading = ref(false)

async function submit() {
  loading.value = true
  try {
    await resumeRun(props.runId, 'answer', undefined, answers.value)
    queryClient.invalidateQueries({ queryKey: ['run', props.runId] })
  } finally {
    loading.value = false
  }
}

async function cancel() {
  loading.value = true
  try {
    await resumeRun(props.runId, 'cancel')
    queryClient.invalidateQueries({ queryKey: ['run', props.runId] })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="rounded-lg border border-violet-200 bg-violet-50 p-4 space-y-4">
    <h3 class="text-sm font-semibold text-violet-900">Clarification Questions</h3>
    <div v-for="(q, i) in props.questions" :key="i" class="space-y-1">
      <label class="text-sm font-medium text-violet-800">{{ q }}</label>
      <textarea
        v-model="answers[i]"
        rows="2"
        class="w-full rounded-md border border-violet-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        placeholder="Your answer..."
      />
    </div>
    <div class="flex gap-2">
      <button
        :disabled="loading"
        class="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        @click="submit"
      >
        Submit Answers
      </button>
      <button
        :disabled="loading"
        class="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        @click="cancel"
      >
        Cancel Run
      </button>
    </div>
  </div>
</template>
