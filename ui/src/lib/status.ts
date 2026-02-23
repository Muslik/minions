import type { RunStatus } from '../types/run'

export interface Column {
  key: string
  label: string
  statuses: RunStatus[]
}

export const COLUMNS: Column[] = [
  { key: 'queued', label: 'Queued', statuses: ['RECEIVED'] },
  { key: 'working', label: 'Working', statuses: ['HYDRATING', 'PLANNING', 'CODING', 'VALIDATING', 'REVIEWING', 'FINALIZING'] },
  { key: 'review', label: 'Awaiting Review', statuses: ['AWAITING_APPROVAL'] },
  { key: 'done', label: 'Done', statuses: ['DONE'] },
  { key: 'problem', label: 'Problem', statuses: ['FAILED', 'ESCALATED'] }
]

export const STATUS_COLORS: Record<RunStatus, string> = {
  RECEIVED: 'bg-gray-100 text-gray-700',
  HYDRATING: 'bg-blue-100 text-blue-700',
  PLANNING: 'bg-blue-100 text-blue-700',
  AWAITING_APPROVAL: 'bg-amber-100 text-amber-700',
  CODING: 'bg-indigo-100 text-indigo-700',
  VALIDATING: 'bg-purple-100 text-purple-700',
  REVIEWING: 'bg-cyan-100 text-cyan-700',
  FINALIZING: 'bg-teal-100 text-teal-700',
  DONE: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  ESCALATED: 'bg-orange-100 text-orange-700'
}

export const STATUS_LABELS: Record<RunStatus, string> = {
  RECEIVED: 'Received',
  HYDRATING: 'Hydrating',
  PLANNING: 'Planning',
  AWAITING_APPROVAL: 'Awaiting Approval',
  CODING: 'Coding',
  VALIDATING: 'Validating',
  REVIEWING: 'Reviewing',
  FINALIZING: 'Finalizing',
  DONE: 'Done',
  FAILED: 'Failed',
  ESCALATED: 'Escalated'
}
