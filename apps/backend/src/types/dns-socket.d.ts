declare module 'dns-socket' {
  interface DnsSocketOptions {
    socket?: any;
    timeout?: number;
  }

  interface DnsQuery {
    questions: Array<{
      type: string;
      name: string;
    }>;
  }

  interface DnsResponse {
    answers: Array<{
      type: string;
      name: string;
      data: any;
      ttl: number;
    }>;
  }

  class DnsSocket {
    constructor(options?: DnsSocketOptions);
    query(query: DnsQuery, port: number, host: string, callback: (error: Error | null, response?: DnsResponse) => void): void;
    cancel(id: number): void;
    destroy(): void;
  }

  export = DnsSocket;
}