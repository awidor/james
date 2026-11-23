import { createModels, createProvider, type Model, type Models } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

export const DEFAULT_LOCAL_BASE_URL = "http://127.0.0.1:8080/v1";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_OPENROUTER_MODEL = "thinkingmachines/inkling-2-mini";
export const DEFAULT_OPENROUTER_PROVIDER = "primeintellect";

export interface LocalProviderConfig {
  baseUrl: string;
  modelId?: string;
  apiKey?: string;
  fallbackToOpenRouter?: boolean;
  openRouterModelId?: string;
  openRouterProvider?: string;
  openRouterApiKey?: string;
}

export interface ResolvedLocalRuntime {
  models: Models;
  model: Model<"openai-completions">;
  baseUrl: string;
  modelId: string;
  isOpenRouter: boolean;
  openRouterProvider?: string;
  fallbackFromLocal?: boolean;
}

interface OpenAIModelsList {
  data?: Array<{
    id?: string;
    context_length?: number;
    max_context_length?: number;
    max_model_len?: number;
    max_completion_tokens?: number;
    max_output_tokens?: number;
    top_provider?: { max_completion_tokens?: number; context_length?: number };
    meta?: { n_ctx?: number };
  }>;
}

interface OpenRouterEndpointsResponse {
  data?: {
    endpoints?: Array<{
      provider_name?: string;
      tag?: string;
      context_length?: number;
      max_completion_tokens?: number;
    }>;
  };
}

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) {
    return trimmed;
  }
  return `${trimmed}/v1`;
}

async function discoverOpenRouterLimits(
  baseUrl: string,
  modelId: string,
  preferredProvider?: string,
): Promise<{ contextWindow: number; maxTokens: number }> {
  try {
    const res = await fetch(`${baseUrl}/models/${modelId}/endpoints`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const payload = (await res.json()) as OpenRouterEndpointsResponse;
      const endpoints = payload.data?.endpoints ?? [];
      const match =
        (preferredProvider
          ? endpoints.find((e) => {
              const want = preferredProvider.toLowerCase();
              const name = e.provider_name?.toLowerCase();
              const tag = e.tag?.toLowerCase();
              return name === want || tag === want || Boolean(tag?.startsWith(`${want}/`));
            })
          : undefined) ?? endpoints[0];
      if (match) {
        return {
          contextWindow: match.context_length ?? 1048576,
          maxTokens: match.max_completion_tokens ?? 65536,
        };
      }
    }
  } catch {
    // Fallback to model defaults if endpoint metadata fetch fails.
  }
  return { contextWindow: 1048576, maxTokens: 65536 };
}

export async function isLocalApiReachable(
  baseUrl: string,
  apiKey?: string,
): Promise<boolean> {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers,
      signal: AbortSignal.timeout(2500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function discoverLocalModel(
  baseUrl: string,
  preferredModelId?: string,
  apiKey?: string,
  options?: { requireReachable?: boolean },
): Promise<{ id: string; contextWindow: number; maxTokens: number }> {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/models`, {
      headers,
      signal: AbortSignal.timeout(options?.requireReachable ? 2500 : 5000),
    });
  } catch (err) {
    if (preferredModelId && !options?.requireReachable) {
      return { id: preferredModelId, contextWindow: 32768, maxTokens: 32768 };
    }
    throw new Error(
      `Cannot reach local OpenAI-compatible API at ${baseUrl}/models. Is your local model server running? (${err instanceof Error ? err.message : String(err)})`,
    );
  }

  if (!res.ok) {
    if (preferredModelId && !options?.requireReachable) {
      return { id: preferredModelId, contextWindow: 32768, maxTokens: 32768 };
    }
    throw new Error(`Local API ${baseUrl}/models returned HTTP ${res.status}`);
  }

  const payload = (await res.json()) as OpenAIModelsList;
  const entries = payload.data ?? [];

  const extractLimits = (m?: NonNullable<OpenAIModelsList["data"]>[number]) => {
    const contextWindow =
      m?.context_length ??
      m?.max_context_length ??
      m?.max_model_len ??
      m?.top_provider?.context_length ??
      m?.meta?.n_ctx ??
      32768;
    const maxTokens =
      m?.max_completion_tokens ??
      m?.max_output_tokens ??
      m?.top_provider?.max_completion_tokens ??
      contextWindow;
    return { contextWindow, maxTokens };
  };

  if (preferredModelId) {
    const match = entries.find((m) => m.id === preferredModelId);
    const { contextWindow, maxTokens } = extractLimits(match);
    return { id: preferredModelId, contextWindow, maxTokens };
  }

  const first = entries.find((m) => typeof m.id === "string" && m.id.length > 0);
  if (!first?.id) {
    throw new Error(
      `No models returned by ${baseUrl}/models. Load a model or set JAMES_MODEL.`,
    );
  }

  const { contextWindow, maxTokens } = extractLimits(first);
  return { id: first.id, contextWindow, maxTokens };
}

function buildRuntime(params: {
  baseUrl: string;
  apiKey: string;
  discovered: { id: string; contextWindow: number; maxTokens: number };
  isOpenRouter: boolean;
  openRouterProvider?: string;
  fallbackFromLocal?: boolean;
}): ResolvedLocalRuntime {
  const { baseUrl, apiKey, discovered, isOpenRouter, openRouterProvider, fallbackFromLocal } =
    params;

  const localModel: Model<"openai-completions"> = {
    id: discovered.id,
    name: `${discovered.id} (${isOpenRouter ? "OpenRouter" : "Local"})`,
    api: "openai-completions",
    provider: "local",
    baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: discovered.contextWindow,
    maxTokens: discovered.maxTokens,
    compat: {
      supportsDeveloperRole: false,
      supportsStore: false,
      supportsReasoningEffort: false,
      supportsUsageInStreaming: false,
      maxTokensField: "max_tokens",
      ...(isOpenRouter && openRouterProvider
        ? {
            openRouterRouting: {
              only: [openRouterProvider],
              order: [openRouterProvider],
              allow_fallbacks: false,
            },
          }
        : {}),
    },
  };

  const provider = createProvider({
    id: "local",
    name: isOpenRouter ? "OpenRouter" : "Local OpenAI-Compatible API",
    baseUrl,
    auth: {
      apiKey: {
        name: isOpenRouter ? "OpenRouter" : "Local",
        resolve: async () => ({
          auth: { apiKey: apiKey || "local" },
        }),
      },
    },
    models: [localModel],
    api: openAICompletionsApi(),
  });

  const models = createModels();
  models.setProvider(provider);

  const model = models.getModel("local", discovered.id) as Model<"openai-completions">;
  return {
    models,
    model,
    baseUrl,
    modelId: discovered.id,
    isOpenRouter,
    openRouterProvider: isOpenRouter && openRouterProvider ? openRouterProvider : undefined,
    fallbackFromLocal: Boolean(fallbackFromLocal),
  };
}

function resolveOpenRouterProviderPin(
  modelId: string,
  configuredProvider?: string,
): string | undefined {
  if (configuredProvider !== undefined) {
    const trimmed = configuredProvider.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return modelId === DEFAULT_OPENROUTER_MODEL ? DEFAULT_OPENROUTER_PROVIDER : undefined;
}

/**
 * Connects Pi AI to an OpenAI-compatible API (default: offline http://127.0.0.1:8080/v1).
 * When `fallbackToOpenRouter` is enabled and the local API is unreachable, falls back
 * to OpenRouter (`thinkingmachines/inkling-2-mini`, pinned to `primeintellect`) using
 * `OPENROUTER_API_KEY`.
 * Intentionally does NOT pass temperature or JSON grammar constraints.
 */
export async function createLocalRuntime(
  overrides?: Partial<LocalProviderConfig>,
): Promise<ResolvedLocalRuntime> {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file present — completely normal for offline runs.
  }

  const baseUrl = normalizeBaseUrl(
    overrides?.baseUrl ?? process.env.JAMES_API_BASE_URL ?? DEFAULT_LOCAL_BASE_URL,
  );
  const isOpenRouter = baseUrl.includes("openrouter.ai");
  const preferredModelId = overrides?.modelId ?? process.env.JAMES_MODEL;
  const openRouterProviderConfig =
    overrides?.openRouterProvider ?? process.env.JAMES_OPENROUTER_PROVIDER;

  if (isOpenRouter) {
    const apiKey = (
      overrides?.apiKey ??
      overrides?.openRouterApiKey ??
      process.env.JAMES_API_KEY ??
      process.env.OPENROUTER_API_KEY ??
      ""
    ).trim();
    if (!apiKey) {
      throw new Error(
        "OpenRouter API key is missing. Set OPENROUTER_API_KEY in .env or JAMES_API_KEY in your environment.",
      );
    }
    const modelId =
      preferredModelId?.trim() ||
      overrides?.openRouterModelId?.trim() ||
      process.env.JAMES_OPENROUTER_MODEL?.trim() ||
      DEFAULT_OPENROUTER_MODEL;
    const pinnedProvider = resolveOpenRouterProviderPin(modelId, openRouterProviderConfig);
    const limits = await discoverOpenRouterLimits(baseUrl, modelId, pinnedProvider);
    return buildRuntime({
      baseUrl,
      apiKey,
      discovered: { id: modelId, ...limits },
      isOpenRouter: true,
      openRouterProvider: pinnedProvider,
      fallbackFromLocal: false,
    });
  }

  const localApiKey = (overrides?.apiKey ?? process.env.JAMES_API_KEY ?? "").trim();

  try {
    const discovered = await discoverLocalModel(baseUrl, preferredModelId, localApiKey || undefined, {
      requireReachable: Boolean(overrides?.fallbackToOpenRouter),
    });
    return buildRuntime({
      baseUrl,
      apiKey: localApiKey,
      discovered,
      isOpenRouter: false,
      fallbackFromLocal: false,
    });
  } catch (localErr) {
    if (!overrides?.fallbackToOpenRouter) {
      throw localErr;
    }

    const openRouterApiKey = (
      overrides?.openRouterApiKey ??
      process.env.OPENROUTER_API_KEY ??
      ""
    ).trim();
    if (!openRouterApiKey) {
      const localReason = localErr instanceof Error ? localErr.message : String(localErr);
      throw new Error(
        `${localReason} OpenRouter fallback is unavailable because OPENROUTER_API_KEY is not set.`,
      );
    }

    const fallbackModelId =
      overrides?.openRouterModelId?.trim() ||
      process.env.JAMES_OPENROUTER_MODEL?.trim() ||
      (preferredModelId && preferredModelId.includes("/") ? preferredModelId.trim() : "") ||
      DEFAULT_OPENROUTER_MODEL;
    const pinnedProvider = resolveOpenRouterProviderPin(
      fallbackModelId,
      openRouterProviderConfig,
    );
    const limits = await discoverOpenRouterLimits(
      OPENROUTER_BASE_URL,
      fallbackModelId,
      pinnedProvider,
    );

    return buildRuntime({
      baseUrl: OPENROUTER_BASE_URL,
      apiKey: openRouterApiKey,
      discovered: { id: fallbackModelId, ...limits },
      isOpenRouter: true,
      openRouterProvider: pinnedProvider,
      fallbackFromLocal: true,
    });
  }
}
