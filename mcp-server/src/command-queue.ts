import { PendingCommand } from './types';

export class CommandQueue {
  private pendingCommands: Map<string, PendingCommand> = new Map();

  addCommand(commandId: string, timeout: number = 30000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        reject(new Error(`Command timeout: ${commandId}`));
      }, timeout);

      this.pendingCommands.set(commandId, {
        resolve,
        reject,
        timeout: timeoutHandle
      });
    });
  }

  resolveCommand(commandId: string, result: any): void {
    const pending = this.pendingCommands.get(commandId);
    if (pending) {
      clearTimeout(pending.timeout);
      pending.resolve(result);
      this.pendingCommands.delete(commandId);
    }
  }

  rejectCommand(commandId: string, error: Error): void {
    const pending = this.pendingCommands.get(commandId);
    if (pending) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pendingCommands.delete(commandId);
    }
  }

  hasPending(commandId: string): boolean {
    return this.pendingCommands.has(commandId);
  }

  clear(): void {
    for (const [id, pending] of this.pendingCommands.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Command queue cleared'));
    }
    this.pendingCommands.clear();
  }
}
