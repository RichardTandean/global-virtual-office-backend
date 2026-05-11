import { Injectable } from '@nestjs/common';

export interface SseClient {
  id: string;
  controller: ReadableStreamDefaultController;
}

@Injectable()
export class SseService {
  private clients: Map<string, SseClient[]> = new Map();

  addClient(taskId: string, client: SseClient) {
    const list = this.clients.get(taskId) || [];
    list.push(client);
    this.clients.set(taskId, list);
  }

  removeClient(taskId: string, clientId: string) {
    const list = this.clients.get(taskId) || [];
    const filtered = list.filter((c) => c.id !== clientId);
    if (filtered.length === 0) {
      this.clients.delete(taskId);
    } else {
      this.clients.set(taskId, filtered);
    }
  }

  broadcast(taskId: string, data: unknown) {
    const list = this.clients.get(taskId) || [];
    const encoder = new TextEncoder();
    const message = encoder.encode(`data: ${JSON.stringify(data)}\n\n`);

    for (const client of list) {
      try {
        client.controller.enqueue(message);
      } catch {
        // Client disconnected
        this.removeClient(taskId, client.id);
      }
    }
  }
}
