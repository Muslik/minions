<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'

const props = defineProps<{ plan: string }>()
const html = computed(() => marked(props.plan))
</script>

<template>
  <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
    <h2 class="text-sm font-semibold mb-4">Plan</h2>
    <div class="prose prose-sm max-w-none" v-html="html" />
  </div>
</template>
