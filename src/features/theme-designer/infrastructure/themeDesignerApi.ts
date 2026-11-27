import type { ThemeColors } from "@/features/theme/domain/types";
import type {
  BrandSourceInfo,
  DesignerMessage,
  GeneratedTheme,
  ResolvedRouteOverlay,
} from "../domain/types";

export interface ThemeDesignerProposal {
  name: string;
  description: string;
  colors: ThemeColors;
}

export interface ThemeDesignerChatResponse {
  reply: string;
  themes: ThemeDesignerProposal[];
  routeOverlay: ResolvedRouteOverlay | null;
  brandSource: BrandSourceInfo | null;
}

function sanitizeBrandSource(value: unknown): BrandSourceInfo | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const url = typeof candidate.url === "string" ? candidate.url.trim() : "";
  const domain =
    typeof candidate.domain === "string" ? candidate.domain.trim() : "";
  if (!url || !domain) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
  } catch {
    return null;
  }
  const cleanColors = (list: unknown): string[] =>
    Array.isArray(list)
      ? list
          .filter(
            (item): item is string =>
              typeof item === "string" && /^#[0-9A-Fa-f]{6}$/.test(item.trim()),
          )
          .map((item) => item.trim().toUpperCase())
          .slice(0, 6)
      : [];
  return {
    name:
      typeof candidate.name === "string" && candidate.name.trim()
        ? candidate.name.trim()
        : domain,
    url,
    domain,
    logoColors: cleanColors(candidate.logoColors),
    siteColors: cleanColors(candidate.siteColors),
  };
}

function isResolvedRouteOverlay(value: unknown): value is ResolvedRouteOverlay {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.label === "string" &&
    typeof candidate.sourceFilename === "string" &&
    Array.isArray(candidate.segments) &&
    candidate.segments.length > 0 &&
    typeof candidate.bounds === "object" &&
    candidate.bounds !== null &&
    typeof candidate.pointCount === "number" &&
    candidate.pointCount >= 2
  );
}

export class ThemeDesignerApiError extends Error {
  status: number;
  summary: string;
  retryable: boolean;

  constructor(options: {
    message: string;
    summary: string;
    status: number;
    retryable: boolean;
  }) {
    super(options.message);
    this.name = "ThemeDesignerApiError";
    this.status = options.status;
    this.summary = options.summary;
    this.retryable = options.retryable;
  }
}

export async function sendThemeDesignerMessage(input: {
  messages: Pick<DesignerMessage, "role" | "content" | "isError">[];
  selectedTheme?: Pick<GeneratedTheme, "name" | "description" | "colors"> | null;
  selectedThemeIsGenerated?: boolean;
  existingThemeNames?: string[];
  officialUrl?: string;
  signal?: AbortSignal;
}): Promise<ThemeDesignerChatResponse> {
  const cleanMessages = input.messages
    .filter((m) => !m.isError)
    .map((m) => ({
      role: m.role,
      content: m.content,
    }));

  let response: Response;
  try {
    response = await fetch("/api/theme-designer/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: cleanMessages,
        selectedTheme: input.selectedTheme
          ? {
              name: input.selectedTheme.name,
              description: input.selectedTheme.description,
              colors: input.selectedTheme.colors,
            }
          : null,
        selectedThemeIsGenerated: Boolean(input.selectedThemeIsGenerated),
        existingThemeNames: input.existingThemeNames ?? [],
        ...(input.officialUrl?.trim()
          ? { officialUrl: input.officialUrl.trim() }
          : {}),
      }),
      signal: input.signal,
    });
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") {
      throw error;
    }
    throw new ThemeDesignerApiError({
      status: 0,
      message: "Could not reach the Theme Designer service.",
      summary:
        "A network or connection error interrupted the request before the server responded. Please click Retry.",
      retryable: true,
    });
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const obj =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : null;
    const errorMessage =
      obj && typeof obj.error === "string" && obj.error.trim()
        ? obj.error.trim()
        : `Theme Designer request failed (HTTP ${response.status}).`;
    const summary =
      obj && typeof obj.summary === "string" && obj.summary.trim()
        ? obj.summary.trim()
        : `The server returned HTTP ${response.status}. ${errorMessage}`;
    const retryable =
      obj && typeof obj.retryable === "boolean"
        ? obj.retryable
        : response.status >= 500 || response.status === 429 || response.status === 408;

    throw new ThemeDesignerApiError({
      status: response.status,
      message: errorMessage,
      summary,
      retryable,
    });
  }

  const data = (payload ?? {}) as Partial<ThemeDesignerChatResponse>;
  return {
    reply:
      typeof data.reply === "string" && data.reply.trim()
        ? data.reply.trim()
        : "Here are your map design results.",
    themes: Array.isArray(data.themes) ? data.themes : [],
    routeOverlay: isResolvedRouteOverlay(data.routeOverlay)
      ? data.routeOverlay
      : null,
    brandSource: sanitizeBrandSource(data.brandSource),
  };
}
