import {
  createEmptyThemeDesignerSession,
  type DesignerMessage,
  type GeneratedTheme,
  type ThemeDesignerSession,
} from "../domain/types";

const SESSION_STORAGE_KEY = "terraink:theme-designer-session";

function isSessionStorageAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.sessionStorage !== "undefined"
  );
}

function isDesignerMessage(value: unknown): value is DesignerMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    (candidate.role === "user" || candidate.role === "assistant") &&
    typeof candidate.content === "string" &&
    typeof candidate.createdAt === "string"
  );
}

function isGeneratedTheme(value: unknown): value is GeneratedTheme {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.colors === "object" &&
    candidate.colors !== null
  );
}

export function loadThemeDesignerSession(): ThemeDesignerSession {
  if (!isSessionStorageAvailable()) {
    return createEmptyThemeDesignerSession();
  }
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return createEmptyThemeDesignerSession();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const messages = Array.isArray(parsed.messages)
      ? parsed.messages.filter(isDesignerMessage)
      : [];
    const generatedThemes = Array.isArray(parsed.generatedThemes)
      ? parsed.generatedThemes.filter(isGeneratedTheme)
      : [];
    const activeId =
      typeof parsed.activeGeneratedThemeId === "string" &&
      generatedThemes.some((t) => t.id === parsed.activeGeneratedThemeId)
        ? parsed.activeGeneratedThemeId
        : null;
    return {
      messages,
      generatedThemes,
      activeGeneratedThemeId: activeId,
    };
  } catch {
    return createEmptyThemeDesignerSession();
  }
}

export function saveThemeDesignerSession(session: ThemeDesignerSession): void {
  if (!isSessionStorageAvailable()) return;
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage quota / serialization errors.
  }
}

export function clearThemeDesignerSessionStorage(): void {
  if (!isSessionStorageAvailable()) return;
  try {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}
