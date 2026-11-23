import type { CustomTemplate } from "../domain/types";

const STORAGE_KEY = "terraink:custom-templates";

function isBrowserStorageAvailable(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function isCustomTemplate(value: unknown): value is CustomTemplate {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.trim().length > 0 &&
    typeof candidate.name === "string" &&
    candidate.name.trim().length > 0 &&
    (candidate.unit === "in" || candidate.unit === "px") &&
    typeof candidate.width === "number" &&
    Number.isFinite(candidate.width) &&
    candidate.width > 0 &&
    typeof candidate.height === "number" &&
    Number.isFinite(candidate.height) &&
    candidate.height > 0 &&
    typeof candidate.widthCm === "number" &&
    Number.isFinite(candidate.widthCm) &&
    candidate.widthCm > 0 &&
    typeof candidate.heightCm === "number" &&
    Number.isFinite(candidate.heightCm) &&
    candidate.heightCm > 0 &&
    typeof candidate.categoryId === "string" &&
    candidate.categoryId.trim().length > 0 &&
    typeof candidate.categoryName === "string" &&
    candidate.categoryName.trim().length > 0
  );
}

function normalizeCustomTemplate(template: CustomTemplate): CustomTemplate {
  return {
    ...template,
    id: template.id.trim(),
    name: template.name.trim(),
    description:
      typeof template.description === "string" ? template.description.trim() : "",
    categoryId: template.categoryId.trim(),
    categoryName: template.categoryName.trim(),
  };
}

export function loadCustomTemplates(): CustomTemplate[] {
  if (!isBrowserStorageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCustomTemplate).map(normalizeCustomTemplate);
  } catch {
    return [];
  }
}

export function saveCustomTemplates(templates: CustomTemplate[]): void {
  if (!isBrowserStorageAvailable()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // Ignore quota / serialization errors.
  }
}
