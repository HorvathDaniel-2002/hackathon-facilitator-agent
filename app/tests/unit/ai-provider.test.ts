import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ create: vi.fn(), config: vi.fn(), abort: vi.fn() }));
vi.mock("openai", () => ({
  AzureOpenAI: class {
    chat = { completions: { create: sdk.create } };
    constructor(config: unknown) { sdk.config(config); }
  },
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("AI_PROVIDER", "azure-openai");
  vi.stubEnv("AZURE_OPENAI_ENDPOINT", "https://example.openai.azure.com");
  vi.stubEnv("AZURE_OPENAI_API_KEY", "fixture-key-not-real");
  vi.stubEnv("AZURE_OPENAI_DEPLOYMENT", "reasoning-deployment");
});
afterEach(() => vi.unstubAllEnvs());
const arguments_ = {
  system: "Plan only", user: "Use case", schemaName: "assessment", jsonSchema: { type: "object" },
  parse: (value: unknown) => value,
};

describe("Azure provider request correctness (SDK mock; no live credentials)", () => {
  it("bounds requests and does not force unsupported temperature or enable tools", async () => {
    sdk.create.mockResolvedValue({
      choices: [{ finish_reason: "stop", message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 20, completion_tokens: 3 },
    });
    const { getAiProvider } = await import("@/lib/ai/provider");
    const result = await getAiProvider().structured(arguments_);
    const [body, options] = sdk.create.mock.calls[0];
    expect(body).toMatchObject({ model: "reasoning-deployment", max_completion_tokens: 8192 });
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("tools");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(sdk.config).toHaveBeenCalledWith(expect.objectContaining({ timeout: 120_000, maxRetries: 0 }));
    expect(result.usage).toEqual({ promptTokens: 20, completionTokens: 3 });
  });
  it.each(["length", "content_filter", "tool_calls"])("rejects incomplete finish reason %s", async (reason) => {
    sdk.create.mockResolvedValue({ choices: [{ finish_reason: reason, message: { content: '{"ok":true}' } }] });
    const { getAiProvider } = await import("@/lib/ai/provider");
    await expect(getAiProvider().structured(arguments_)).rejects.toThrow(/refused or truncated/);
  });
  it("never surfaces provider secrets, response bodies or malformed JSON", async () => {
    sdk.create.mockRejectedValue(new Error("fixture-key-not-real entire sensitive prompt"));
    const { getAiProvider } = await import("@/lib/ai/provider");
    await expect(getAiProvider().structured(arguments_)).rejects.toThrow("AI generation failed.");
    sdk.create.mockResolvedValue({ choices: [{ finish_reason: "stop", message: { content: "malformed private json" } }] });
    await expect(getAiProvider().structured(arguments_)).rejects.not.toThrow(/private/);
  });
  it("requires a real deployment instead of falling back to mock-model", async () => {
    vi.stubEnv("AZURE_OPENAI_DEPLOYMENT", "");
    const { getAiProvider } = await import("@/lib/ai/provider");
    expect(() => getAiProvider()).toThrow(/DEPLOYMENT/);
    expect(sdk.create).not.toHaveBeenCalled();
  });
  it("requires an explicit successful terminal stream event", async () => {
    const completion = (async function* () { yield { choices: [{ delta: { content: "Partial" } }] }; })();
    sdk.create.mockResolvedValue(Object.assign(completion, { controller: { abort: sdk.abort } }));
    const { getAiProvider } = await import("@/lib/ai/provider");
    const source = await getAiProvider().stream({ system: "plan", user: "canvas", platform: "AzureAI" });
    const consume = async () => { for await (const chunk of source) expect(chunk).toBe("Partial"); };
    await expect(consume()).rejects.toThrow(/before the guide was complete/);
    expect(sdk.abort).toHaveBeenCalled();
  });
  it("rejects prompt oversize before sending any request", async () => {
    const { getAiProvider } = await import("@/lib/ai/provider");
    await expect(getAiProvider().structured({ ...arguments_, user: "x".repeat(65_001) })).rejects.toThrow(/too large/);
    expect(sdk.create).not.toHaveBeenCalled();
  });
});
