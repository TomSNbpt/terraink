import type { ThemeColors } from "@/features/theme/domain/types";
import type {
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

export async function sendThemeDesignerMessage(input: {
  messages: Pick<DesignerMessage, "role" | "content">[];
  selectedTheme?: Pick<GeneratedTheme, "name" | "description" | "colors"> | null;
  selectedThemeIsGenerated?: boolean;
  existingThemeNames?: string[];
  signal?: AbortSignal;
}): Promise<ThemeDesignerChatResponse> {
  const response = await fetch("/api/theme-designer/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: input.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      selectedTheme: input.selectedTheme
        ? {
            name: input.selectedTheme.name,
            description: input.selectedTheme.description,
            colors: input.selectedTheme.colors,
          }
        : null,
      selectedThemeIsGenerated: Boolean(input.selectedThemeIsGenerated),
      existingThemeNames: input.existingThemeNames ?? [],
    }),
    signal: input.signal,
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorMessage =
      payload &&
      typeof payload === "object" &&
      typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Theme Designer request failed (HTTP ${response.status}).`;
    throw new Error(errorMessage);
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
  };
}
