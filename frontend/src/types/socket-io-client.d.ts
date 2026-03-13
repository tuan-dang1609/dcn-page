declare module "socket.io-client" {
  export interface Socket {
    id?: string;
    connected: boolean;
    data?: Record<string, unknown>;
    on(event: string, listener: (...args: any[]) => void): this;
    emit(event: string, ...args: any[]): this;
    removeAllListeners(): this;
    disconnect(): this;
    join?(room: string): this;
  }

  export function io(
    uri: string,
    options?: {
      path?: string;
      transports?: string[];
      auth?: Record<string, unknown>;
    },
  ): Socket;
}
