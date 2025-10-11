declare module "@opencode-ai/sdk" {
  interface CreateOpencodeOptions {
    hostname?: string;
    port?: number;
    config?: {
      model?: string;
      agent?: string | null;
      [key: string]: unknown;
    };
  }

  interface CreateOpencodeResult {
    client: OpencodeClient;
    server?: {
      url: string;
      close(): Promise<void>;
    };
  }

  interface CreateOpencodeClientOptions {
    baseUrl: string;
  }

  interface ModelDescriptor {
    providerID: string;
    modelID: string;
  }

  interface PromptBody {
    model: ModelDescriptor;
    parts: Array<{ type: "text"; text: string }>;
    agent?: { id: string };
    responseStyle?: "text" | "fields";
  }

  interface PromptResponse {
    info?: unknown;
    parts?: Array<{ type?: string; text?: string; content?: string }>;
  }

  interface SessionEntity {
    id: string;
    title?: string;
  }

  interface OpencodeClient {
    session: {
      create(args: { body?: { title?: string } }): Promise<SessionEntity>;
      prompt(args: { path: { id: string }; body: PromptBody }): Promise<PromptResponse>;
      delete(args: { path: { id: string } }): Promise<unknown>;
    };
  }

  export function createOpencode(options?: CreateOpencodeOptions): Promise<CreateOpencodeResult>;
  export function createOpencodeClient(options: CreateOpencodeClientOptions): OpencodeClient;
}
