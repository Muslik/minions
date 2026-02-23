<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'

const props = defineProps<{ plan: string }>()
const html = computed(() => marked.parse(props.plan) as string)
</script>

<template>
  <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
    <h2 class="text-sm font-semibold mb-4">Plan</h2>
    <div class="plan-content text-sm leading-relaxed" v-html="html" />
  </div>
</template>

<style scoped>
.plan-content :deep(h1) { font-size: 1.25rem; font-weight: 700; margin: 1.5rem 0 0.75rem; }
.plan-content :deep(h2) { font-size: 1.125rem; font-weight: 700; margin: 1.25rem 0 0.5rem; }
.plan-content :deep(h3) { font-size: 1rem; font-weight: 600; margin: 1rem 0 0.5rem; }
.plan-content :deep(h4) { font-size: 0.875rem; font-weight: 600; margin: 0.75rem 0 0.25rem; }
.plan-content :deep(p) { margin: 0.5rem 0; }
.plan-content :deep(ul),
.plan-content :deep(ol) { margin: 0.5rem 0; padding-left: 1.5rem; }
.plan-content :deep(ul) { list-style-type: disc; }
.plan-content :deep(ol) { list-style-type: decimal; }
.plan-content :deep(li) { margin: 0.25rem 0; }
.plan-content :deep(code) {
  background: hsl(var(--secondary));
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.8125rem;
}
.plan-content :deep(pre) {
  background: hsl(var(--secondary));
  padding: 0.75rem 1rem;
  border-radius: 0.375rem;
  overflow-x: auto;
  margin: 0.75rem 0;
}
.plan-content :deep(pre code) {
  background: none;
  padding: 0;
}
.plan-content :deep(blockquote) {
  border-left: 3px solid hsl(var(--border));
  padding-left: 1rem;
  margin: 0.75rem 0;
  color: hsl(var(--muted-foreground));
}
.plan-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.75rem 0;
}
.plan-content :deep(th),
.plan-content :deep(td) {
  border: 1px solid hsl(var(--border));
  padding: 0.375rem 0.75rem;
  text-align: left;
}
.plan-content :deep(th) {
  background: hsl(var(--secondary));
  font-weight: 600;
}
.plan-content :deep(hr) {
  border: none;
  border-top: 1px solid hsl(var(--border));
  margin: 1rem 0;
}
.plan-content :deep(a) {
  color: hsl(var(--primary));
  text-decoration: underline;
}
.plan-content :deep(strong) { font-weight: 600; }
</style>
