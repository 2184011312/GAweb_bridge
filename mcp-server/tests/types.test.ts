import { CommandMessage, ResponseMessage, EventMessage, ErrorCode } from '../src/types';

describe('Message Types', () => {
  it('should create valid CommandMessage', () => {
    const msg: CommandMessage = {
      id: 'test-id',
      type: 'command',
      command: 'navigate',
      params: { tabId: 1, url: 'https://example.com' }
    };
    expect(msg.type).toBe('command');
  });

  it('should create valid ResponseMessage', () => {
    const msg: ResponseMessage = {
      id: 'test-id',
      type: 'response',
      success: true,
      result: { status: 'ok' }
    };
    expect(msg.success).toBe(true);
  });

  it('should create valid EventMessage', () => {
    const msg: EventMessage = {
      type: 'event',
      event: 'tab_updated',
      data: { tabId: 1 },
      timestamp: Date.now()
    };
    expect(msg.type).toBe('event');
  });

  it('should have all expected error codes', () => {
    expect(ErrorCode.CONNECTION_LOST).toBe('CONNECTION_LOST');
    expect(ErrorCode.TAB_NOT_FOUND).toBe('TAB_NOT_FOUND');
    expect(ErrorCode.TIMEOUT).toBe('TIMEOUT');
  });
});
