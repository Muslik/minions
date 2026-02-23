<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import NewRunDialog from '../board/NewRunDialog.vue'

const showNewRun = ref(false)
</script>

<template>
  <header class="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
    <div class="container mx-auto px-4 h-14 flex items-center justify-between">
      <RouterLink to="/" class="flex items-center gap-2">
        <span class="text-lg font-bold">Minions</span>
      </RouterLink>
      <button
        class="px-4 py-2 text-sm rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
        @click="showNewRun = true"
      >
        + New Run
      </button>
    </div>
  </header>
  <NewRunDialog v-model:open="showNewRun" />
</template>
