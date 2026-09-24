import { AzureOpenAI } from "openai";
import { AiError, safeAiError } from "./errors";
import {
  assertPromptSize,
  GENERATION_TIMEOUT_MS,
  MAX_COMPLETION_TOKENS,
  MAX_OUTPUT_CHARS,
} from "./limits";
import type { Platform } from "@/lib/schemas";

export type AiProviderName = "azure-openai" | "mock";

export function resolveProviderName(env: Record<string, string | undefined> = process.env): AiProviderName {
  if (env.AI_PROVIDER && env.AI_PROVIDER !== "mock" && env.AI_PROVIDER !== "azure-openai") {
    throw new AiError("AI_PROVIDER must be mock or azure-openai.", 503);
  }
  if (env.AI_PROVIDER === "mock" || env.AI_PROVIDER === "azure-openai") return env.AI_PROVIDER;
  // Partially configured real providers must fail, never silently return fixtures.
  return Object.keys(env).some((key) => key.startsWith("AZURE_OPENAI_") && env[key])
    ? "azure-openai"
    : "mock";
}

export const AI_PROVIDER = resolveProviderName();
export const AI_MODEL = AI_PROVIDER === "mock"
  ? "mock-model"
  : process.env.AZURE_OPENAI_DEPLOYMENT?.trim() || "unconfigured";

export interface CompletionUsage {
  promptTokens: number;
  completionTokens: number;
}
export interface StructuredResult<T> {
  data: T;
  usage: CompletionUsage;
  model: string;
}
export interface AiProvider {
  name: AiProviderName;
  structured<T>(args: {
    system: string;
    user: string;
    schemaName: string;
    jsonSchema: Record<string, unknown>;
    parse: (raw: unknown) => T;
    signal?: AbortSignal;
  }): Promise<StructuredResult<T>>;
  stream(args: {
    system: string;
    user: string;
    platform: Platform;
    signal?: AbortSignal;
  }): Promise<AsyncIterable<string>>;
}

export function validateAzureConfig(env: Record<string, string | undefined> = process.env): {
  endpoint: string; apiKey: string; deployment: string; apiVersion: string;
} {
  const endpoint = env.AZURE_OPENAI_ENDPOINT?.trim();
  const apiKey = env.AZURE_OPENAI_API_KEY?.trim();
  const deployment = env.AZURE_OPENAI_DEPLOYMENT?.trim();
  if (!endpoint || !apiKey || !deployment) {
    throw new AiError(
      "Azure OpenAI requires AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY and AZURE_OPENAI_DEPLOYMENT. Use AI_PROVIDER=mock only for explicit demo mode.",
      503,
    );
  }
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error();
  } catch {
    throw new AiError("AZURE_OPENAI_ENDPOINT must be an HTTPS service URL without credentials or query parameters.", 503);
  }
  return {
    endpoint, apiKey, deployment,
    apiVersion: env.AZURE_OPENAI_API_VERSION || "2024-10-21",
  };
}

function azureClient(): AzureOpenAI {
  const config = validateAzureConfig();
  return new AzureOpenAI({ ...config, timeout: GENERATION_TIMEOUT_MS, maxRetries: 0 });
}

function boundedSignal(signal?: AbortSignal): AbortSignal {
  const deadline = AbortSignal.timeout(GENERATION_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, deadline]) : deadline;
}

const azureProvider: AiProvider = {
  name: "azure-openai",
  async structured({ system, user, schemaName, jsonSchema, parse, signal }) {
    assertPromptSize(system, user);
    const client = azureClient();
    try {
      const response = await client.chat.completions.create({
        model: AI_MODEL,
        // Do not force temperature: reasoning deployments may not support it.
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        response_format: {
          type: "json_schema",
          json_schema: { name: schemaName, schema: jsonSchema, strict: true },
        },
      }, { signal: boundedSignal(signal) });
      const choice = response.choices[0];
      if (choice?.finish_reason !== "stop" || choice.message.refusal) {
        throw new AiError("The model refused or truncated the evaluation. No evaluation was saved.");
      }
      const content = choice.message.content;
      if (!content || content.length > MAX_OUTPUT_CHARS) {
        throw new AiError("The model returned an empty or oversized evaluation.");
      }
      const data = (() => {
        try { return parse(JSON.parse(content)); }
        catch { throw new AiError("The model returned an invalid evaluation. No evaluation was saved."); }
      })();
      return {
        data,
        usage: {
          promptTokens: response.usage?.prompt_tokens ?? 0,
          completionTokens: response.usage?.completion_tokens ?? 0,
        },
        model: AI_MODEL,
      };
    } catch (error) {
      throw safeAiError(error);
    }
  },
  async stream({ system, user, signal }) {
    assertPromptSize(system, user);
    const client = azureClient();
    try {
      const completion = await client.chat.completions.create({
        model: AI_MODEL,
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        stream: true,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }, { signal: boundedSignal(signal) });
      async function* iterate() {
        let characters = 0;
        let finished = false;
        try {
          for await (const chunk of completion) {
            const choice = chunk.choices[0];
            if (choice?.delta?.refusal) throw new AiError("The model refused this guide.");
            const delta = choice?.delta?.content;
            if (delta) {
              characters += delta.length;
              if (characters > MAX_OUTPUT_CHARS) throw new AiError("The guide exceeded the output limit.");
              yield delta;
            }
            if (choice?.finish_reason) {
              if (choice.finish_reason !== "stop") throw new AiError("The guide was truncated or filtered.");
              finished = true;
            }
          }
          if (!finished) throw new AiError("The model stream ended before the guide was complete.");
        } catch (error) {
          throw safeAiError(error);
        } finally {
          completion.controller.abort();
        }
      }
      return iterate();
    } catch (error) {
      throw safeAiError(error);
    }
  },
};

const mockProvider: AiProvider = {
  name: "mock",
  async structured({ system, user, parse }) {
    assertPromptSize(system, user);
    const { mockEvaluation } = await import("./mock-fixtures");
    const { getMethodology } = await import("@/lib/methodology");
    const { evaluationWireValue } = await import("./output-schema");
    const routing = getMethodology().routing;
    const signalIds = [...routing.signals.copilotStudio, ...routing.signals.azureAI].map((signal) => signal.id);
    return {
      data: parse(evaluationWireValue(mockEvaluation(user), signalIds)),
      usage: { promptTokens: 0, completionTokens: 0 },
      model: "mock-model",
    };
  },
  async stream({ system, user, platform, signal }) {
    assertPromptSize(system, user);
    const { mockGuide } = await import("./mock-fixtures");
    const text = mockGuide(user, platform);
    async function* iterate() {
      for (const part of text.match(/[\s\S]{1,120}/g) ?? []) {
        signal?.throwIfAborted();
        await new Promise((resolve) => setTimeout(resolve, 12));
        yield part;
      }
    }
    return iterate();
  },
};

export function getAiProvider(): AiProvider {
  if (AI_PROVIDER === "azure-openai") {
    validateAzureConfig();
    return azureProvider;
  }
  return mockProvider;
}
