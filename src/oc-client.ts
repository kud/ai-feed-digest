import type { DigestConfig } from "@/lib/types";

type OpencodeModule = typeof import("@opencode-ai/sdk");
type EmbeddedInstance = Awaited<ReturnType<OpencodeModule["createOpencode"]>>;
type OpencodeClient = EmbeddedInstance["client"];

interface ClientWrapper {
  client: OpencodeClient;
  cleanup?: () => Promise<void> | void;
}

let clientPromise: Promise<ClientWrapper | null> | null = null;
let hasWarned = false;

export async function warmupClient(config: DigestConfig): Promise<void> {
  await ensureClient(config);
}

export async function requestCompletion(prompt: string, config: DigestConfig): Promise<string | null> {
  try {
    const wrapper = await ensureClient(config);
    if (!wrapper) {
      return null;
    }
    return await issuePrompt(wrapper.client, prompt, config);
  } catch (error) {
    warnOnce(error as Error);
    return null;
  }
}

async function ensureClient(config: DigestConfig): Promise<ClientWrapper | null> {
  if (clientPromise) {
    return clientPromise;
  }

  clientPromise = (async () => {
    try {
      const mod: OpencodeModule = await import("@opencode-ai/sdk");

      if (process.env.OPENCODE_BASE_URL && typeof mod.createOpencodeClient === "function") {
        const client = mod.createOpencodeClient({ baseUrl: process.env.OPENCODE_BASE_URL });
        return { client };
      }

      if (typeof mod.createOpencode !== "function") {
        warnOnce(new Error("'createOpencode' unavailable. Update '@opencode-ai/sdk'."));
        return null;
      }

      const instance = await mod.createOpencode({
        config: {
          model: config.opencode.model,
          ...(config.opencode.agent ? { agent: config.opencode.agent } : {}),
          ...readConfigOverride()
        }
      });

      const cleanup = createCleanup(instance);
      if (cleanup) {
        attachCleanup(cleanup);
      }

      return { client: instance.client, cleanup };
    } catch (error) {
      warnOnce(error as Error);
      return null;
    }
  })();

  const wrapper = await clientPromise;
  if (!wrapper) {
    clientPromise = null;
  }
  return wrapper;
}

async function issuePrompt(client: OpencodeClient, prompt: string, config: DigestConfig): Promise<string> {
  const model = parseModel(config.opencode.model);

  // Create session and extract ID properly from nested data structure
  const sessionResponse = await client.session.create({ body: { title: `rss-digest-${Date.now()}` } });
  const sessionId = (sessionResponse as any)?.data?.id || (sessionResponse as any)?.id || sessionResponse;

  try {
    const response = await client.session.prompt({
      path: { id: sessionId },
      body: {
        model,
        parts: [{ type: "text", text: prompt }],
        ...(config.opencode.agent ? { agent: { id: config.opencode.agent } } : {}),
        responseStyle: "text"
      }
    });

    const text = extractParts(response);
    if (!text) {
      throw new Error("OpenCode response did not contain text output");
    }
    return text;
  } finally {
    await safeDeleteSession(client, sessionId);
  }
}

function extractParts(response: unknown): string {
  if (!response || typeof response !== "object") {
    console.log("[AI] Invalid response type:", typeof response);
    return "";
  }

  // Handle nested data structure from OpenCode SDK 0.14.6
  const data = (response as any)?.data;
  if (!data) {
    console.log("[AI] Response missing data:", JSON.stringify(response).slice(0, 200));
    return "";
  }

  // Try to extract parts array
  const parts = data.parts || data.info?.parts;
  if (!parts || !Array.isArray(parts)) {
    console.log("[AI] Response structure:", JSON.stringify(data).slice(0, 500));
    return "";
  }

  const segments: string[] = [];
  for (const part of parts) {
    if (typeof part?.text === "string") {
      segments.push(part.text);
    } else if (typeof part?.content === "string") {
      segments.push(part.content);
    }
  }

  const result = segments.join("\n").trim();
  if (!result) {
    console.log("[AI] No text extracted from parts:", JSON.stringify(parts).slice(0, 200));
  }

  return result;
}

function createCleanup(instance: EmbeddedInstance): (() => Promise<void>) | undefined {
  if (instance.server && typeof instance.server.close === "function") {
    return async () => {
      try {
        await instance.server?.close();
      } catch {
        // ignore cleanup failures
      }
    };
  }
  return undefined;
}

function parseModel(model: string): { providerID: string; modelID: string } {
  if (!model.includes("/")) {
    return { providerID: "openai", modelID: model };
  }
  const [providerID, ...rest] = model.split("/");
  return { providerID, modelID: rest.join("/") };
}

async function safeDeleteSession(client: OpencodeClient, id: string): Promise<void> {
  try {
    await client.session.delete({ path: { id } });
  } catch {
    // ignore cleanup errors
  }
}

function attachCleanup(cleanup: () => Promise<void> | void) {
  if (typeof process?.once === "function") {
    process.once("exit", () => {
      void cleanup();
    });
    process.once("SIGINT", () => {
      void cleanup();
      process.exit(0);
    });
  }
}

function readConfigOverride(): Record<string, unknown> {
  try {
    if (process.env.OPENCODE_CONFIG_JSON) {
      return JSON.parse(process.env.OPENCODE_CONFIG_JSON);
    }
  } catch {
    // ignore invalid JSON
  }
  return {};
}

function warnOnce(error: Error) {
  if (hasWarned || process.env.NODE_ENV === "production") {
    return;
  }
  console.warn(
    "[summarise] OpenCode SDK error:",
    error.message,
    "Make sure '@opencode-ai/sdk' is installed, then run 'opencode start --model github-copilot/gpt-4.1' or export OPENCODE_BASE_URL=http://127.0.0.1:4096 before running the digest."
  );
  hasWarned = true;
}
