import { CommandQueue } from '../src/command-queue';

describe('CommandQueue', () => {
  let queue: CommandQueue;

  beforeEach(() => {
    queue = new CommandQueue();
  });

  it('should add command and resolve on response', async () => {
    const commandId = 'test-123';
    const promise = queue.addCommand(commandId, 5000);

    setTimeout(() => {
      queue.resolveCommand(commandId, { status: 'ok' });
    }, 100);

    const result = await promise;
    expect(result).toEqual({ status: 'ok' });
  });

  it('should reject on timeout', async () => {
    const commandId = 'test-456';
    const promise = queue.addCommand(commandId, 100);

    await expect(promise).rejects.toThrow('Command timeout');
  });

  it('should reject on error', async () => {
    const commandId = 'test-789';
    const promise = queue.addCommand(commandId, 5000);

    setTimeout(() => {
      queue.rejectCommand(commandId, new Error('Test error'));
    }, 100);

    await expect(promise).rejects.toThrow('Test error');
  });
});
