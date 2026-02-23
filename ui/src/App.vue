<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useSSE } from './composables/useSSE'
import AppHeader from './components/layout/AppHeader.vue'

useSSE()
</script>

<template>
  <div class="min-h-screen bg-[hsl(var(--background))]">
    <AppHeader />
    <main class="container mx-auto px-4 py-6">
      <RouterView />
    </main>
  </div>
</template>
