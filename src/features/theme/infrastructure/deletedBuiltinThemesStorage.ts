const STORAGE_KEY = "terraink:deleted-builtin-themes";

function isBrowserStorageAvailable(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

export function loadDeletedBuiltinThemeIds(): string[] {
  if (!isBrowserStorageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed.filter(
          (item): item is string =>
            typeof item === "string" && item.trim().length > 0,
        ),
      ),
    );
  } catch {
    return [];
  }
}

export function saveDeletedBuiltinThemeIds(themeIds: string[]): void {
  if (!isBrowserStorageAvailable()) return;
  try {
    if (themeIds.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(themeIds));
  } catch {
    // Ignore quota / serialization errors.
  }
}
