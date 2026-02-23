<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { createRun } from '../../api/runs'
import { useQueryClient } from '@tanstack/vue-query'
import { useRouter } from 'vue-router'

const open = defineModel<boolean>('open', { default: false })
const ticketKey = ref('')
const error = ref('')
const existingRunId = ref('')
const loading = ref(false)
const queryClient = useQueryClient()
const router = useRouter()

async function submit() {
  if (!ticketKey.value.trim()) return
  error.value = ''
  existingRunId.value = ''
  loading.value = true
  try {
    const { runId } = await createRun({ ticketKey: ticketKey.value.trim() })
    queryClient.invalidateQueries({ queryKey: ['runs'] })
    open.value = false
    ticketKey.value = ''
    router.push(`/runs/${runId}`)
  } catch (e: any) {
    if (e.status === 409) {
      error.value = 'Active run already exists for this ticket'
      existingRunId.value = e.body?.existingRun?.id
    } else {
      error.value = e.message || 'Failed to create run'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="fixed inset-0 bg-black/50" @click="open = false" />
      <div class="relative z-10 w-full max-w-md rounded-lg bg-[hsl(var(--card))] p-6 shadow-lg border border-[hsl(var(--border))]">
        <h2 class="text-lg font-semibold mb-4">New Run</h2>
        <form @submit.prevent="submit">
          <label class="block text-sm font-medium mb-1">Jira Ticket Key</label>
          <input
            v-model="ticketKey"
            placeholder="PROJECT-123"
            class="w-full rounded-md border border-[hsl(var(--input))] bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
            :disabled="loading"
          />
          <div v-if="error" class="mt-2 text-sm text-[hsl(var(--destructive))]">
            {{ error }}
            <RouterLink
              v-if="existingRunId"
              :to="`/runs/${existingRunId}`"
              class="underline ml-1"
              @click="open = false"
            >
              View existing run
            </RouterLink>
          </div>
          <div class="flex justify-end gap-2 mt-4">
            <button
              type="button"
              class="px-4 py-2 text-sm rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]"
              @click="open = false"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="px-4 py-2 text-sm rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50"
              :disabled="loading || !ticketKey.trim()"
            >
              {{ loading ? 'Creating...' : 'Create Run' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
