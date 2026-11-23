import { createModels, createProvider, type Model, type Models } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

export interface LocalProviderConfig {
  baseUrl: string;
  modelId?: string;
  apiKey?: string;
}

export interface ResolvedLocalRuntime {
  models: Models;
  model: Model<"openai-completions">;
  baseUrl: string;
  modelId: string;
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
          ? endpoints.find(
              (e) =>
                e.provider_name?.toLowerCase() === preferredProvider.toLowerCase() ||
                e.tag?.toLowerCase() === preferredProvider.toLowerCase(),
            )
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

async function discoverLocalModel(
  baseUrl: string,
  preferredModelId?: string,
  apiKey?: string,
): Promise<{ id: string; contextWindow: number; maxTokens: number }> {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/models`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    if (preferredModelId) {
      return { id: preferredModelId, contextWindow: 32768, maxTokens: 32768 };
    }
    throw new Error(
      `Cannot reach local OpenAI-compatible API at ${baseUrl}/models. Is your local model server running? (${err instanceof Error ? err.message : String(err)})`,
    );
  }

  if (!res.ok) {
    if (preferredModelId) {
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

/**
 * Connects Pi AI to an OpenAI-compatible API (default: offline http://127.0.0.1:8080/v1).
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
    overrides?.baseUrl ?? process.env.JAMES_API_BASE_URL ?? "http://127.0.0.1:8080/v1",
  );
  const isOpenRouter = baseUrl.includes("openrouter.ai");
  const apiKey =
    overrides?.apiKey ??
    process.env.JAMES_API_KEY ??
    (isOpenRouter ? process.env.OPENROUTER_API_KEY : undefined) ??
    "";
  const preferredModelId = overrides?.modelId ?? process.env.JAMES_MODEL;

  const openRouterProvider = process.env.JAMES_OPENROUTER_PROVIDER?.trim();

  const discovered =
    isOpenRouter && preferredModelId
      ? {
          id: preferredModelId,
          ...(await discoverOpenRouterLimits(baseUrl, preferredModelId, openRouterProvider)),
        }
      : await discoverLocalModel(baseUrl, preferredModelId, apiKey || undefined);

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
            },
          }
        : {}),
    },
  };

  const provider = createProvider({
    id: "local",
    name: "Local OpenAI-Compatible API",
    baseUrl,
    auth: {
      apiKey: {
        name: "Local",
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
  };
}
