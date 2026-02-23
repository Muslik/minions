import type { Run, RunEvent } from '../types/run'
import { apiFetch } from './client'

export function fetchRuns(): Promise<Run[]> {
  return apiFetch<Run[]>('/runs')
}

export function fetchRun(id: string): Promise<Run> {
  return apiFetch<Run>(`/runs/${id}`)
}

export function createRun(data: { ticketKey?: string; ticketUrl?: string; description?: string }): Promise<{ runId: string }> {
  return apiFetch<{ runId: string }>('/runs/coding', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export function resumeRun(id: string, action: 'approve' | 'revise' | 'cancel' | 'answer', comment?: string, answers?: string[]): Promise<void> {
  return apiFetch(`/runs/${id}/resume`, {
    method: 'POST',
    body: JSON.stringify({ action, comment, answers })
  })
}

export function fetchRunEvents(id: string): Promise<RunEvent[]> {
  return apiFetch<RunEvent[]>(`/runs/${id}/events`)
}

export function deleteRun(id: string): Promise<void> {
  return apiFetch(`/runs/${id}`, { method: 'DELETE' })
}

export function fetchArtifacts(id: string): Promise<string[]> {
  return apiFetch<string[]>(`/runs/${id}/artifacts`)
}
