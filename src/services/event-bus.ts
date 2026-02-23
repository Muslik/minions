import { EventEmitter } from 'node:events';

export interface StatusChangeEvent {
  runId: string;
  status: string;
  timestamp: string;
}

export interface RunEventPayload {
  runId: string;
  type: string;
  data: unknown;
  timestamp: string;
}

export class EventBus extends EventEmitter {
  emitStatusChange(event: StatusChangeEvent): void {
    this.emit('status', event);
  }

  emitRunEvent(event: RunEventPayload): void {
    this.emit('event', event);
  }
}
