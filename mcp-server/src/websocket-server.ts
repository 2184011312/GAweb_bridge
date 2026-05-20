import { WebSocketServer as WsServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { CommandMessage, ResponseMessage, EventMessage } from './types';

export class WebSocketServer extends EventEmitter {
  private wss: WsServer | null = null;
  private extensionConnection: WebSocket | null = null;
  private port: number;

  constructor(port: number = 8765) {
    super();
    this.port = port;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss = new WsServer({ port: this.port });

      this.wss.on('listening', () => {
        console.log(`WebSocket server listening on port ${this.port}`);
        resolve();
      });

      this.wss.on('error', (error) => {
        console.error('WebSocket server error:', error);
        reject(error);
      });

      this.wss.on('connection', (ws: WebSocket) => {
        console.log('Extension connected');
        this.extensionConnection = ws;
        this.emit('connection', ws);

        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (error) {
            console.error('Failed to parse message:', error);
          }
        });

        ws.on('close', () => {
          console.log('Extension disconnected');
          this.extensionConnection = null;
          this.emit('disconnect');
        });

        ws.on('error', (error) => {
          console.error('WebSocket connection error:', error);
        });
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.extensionConnection) {
        this.extensionConnection.close();
        this.extensionConnection = null;
      }

      if (this.wss) {
        this.wss.close(() => {
          console.log('WebSocket server stopped');
          this.wss = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  isRunning(): boolean {
    return this.wss !== null;
  }

  isConnected(): boolean {
    return this.extensionConnection !== null &&
           this.extensionConnection.readyState === WebSocket.OPEN;
  }

  sendCommand(message: CommandMessage): void {
    if (!this.isConnected()) {
      throw new Error('Extension not connected');
    }
    this.extensionConnection!.send(JSON.stringify(message));
  }

  private handleMessage(message: ResponseMessage | EventMessage): void {
    if (message.type === 'response') {
      this.emit('response', message);
    } else if (message.type === 'event') {
      this.emit('event', message);
    }
  }
}
