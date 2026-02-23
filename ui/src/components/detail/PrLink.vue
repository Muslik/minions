<script setup lang="ts">
defineProps<{ url: string }>()
</script>

<template>
  <div class="rounded-lg border border-green-200 bg-green-50 p-4 flex items-center gap-2">
    <span class="text-sm font-medium text-green-800">Pull Request:</span>
    <a :href="url" target="_blank" rel="noopener" class="text-sm text-green-700 hover:underline">
      {{ url }}
    </a>
  </div>
</template>
