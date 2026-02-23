export type RunStatus =
  | 'RECEIVED'
  | 'HYDRATING'
  | 'CLARIFYING'
  | 'PLANNING'
  | 'AWAITING_APPROVAL'
  | 'CODING'
  | 'VALIDATING'
  | 'REVIEWING'
  | 'FINALIZING'
  | 'WAITING_FOR_CI'
  | 'DONE'
  | 'FAILED'
  | 'ESCALATED'

export interface RunPayload {
  ticketUrl: string
  chatId: string
  requesterId: string
}

export interface RunContext {
  runId: string
  ticketUrl: string
  chatId: string
  requesterId: string
  jiraIssue?: {
    key: string
    summary: string
    description: string
    components: string[]
    labels: string[]
    links: string[]
    figmaLinks: string[]
  }
  prUrl?: string
  [key: string]: unknown
}

export interface Run {
  id: string
  status: RunStatus
  payload: RunPayload
  context: RunContext
  plan?: string
  questions?: string[]
  createdAt: string
  updatedAt: string
}

export interface RunEvent {
  id: number
  runId: string
  type: string
  data: unknown
  createdAt: string
}
