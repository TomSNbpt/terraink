import { CM_PER_INCH } from "@/core/config";
import { OUTPUT_DPI } from "@/features/poster/infrastructure/renderer/constants";
import type { CustomSizeUnit } from "@/features/poster/application/posterReducer";
import { clamp } from "@/shared/geo/math";

export function cmToGuideDisplayValue(
  cm: number,
  unit: CustomSizeUnit,
): number {
  if (!Number.isFinite(cm) || cm < 0) return 0;
  if (unit === "px") {
    return Math.round((cm / CM_PER_INCH) * OUTPUT_DPI);
  }
  return Math.round((cm / CM_PER_INCH) * 100) / 100;
}

export function cmToGuideDisplayString(
  cm: number,
  unit: CustomSizeUnit,
): string {
  if (!Number.isFinite(cm) || cm < 0) return "0";
  return String(cmToGuideDisplayValue(cm, unit));
}

export function guideDisplayValueToCm(
  value: number,
  unit: CustomSizeUnit,
): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (unit === "px") {
    return (value / OUTPUT_DPI) * CM_PER_INCH;
  }
  return value * CM_PER_INCH;
}

export function formatGuideReadout(
  cm: number,
  unit: CustomSizeUnit,
): string {
  const display = cmToGuideDisplayValue(cm, unit);
  return unit === "px" ? `${display} px` : `${display} in`;
}

export function clampGuideOffsetCm(offsetCm: number, maxCm: number): number {
  if (!Number.isFinite(offsetCm)) return 0;
  const upperBound = Number.isFinite(maxCm) && maxCm > 0 ? maxCm : offsetCm;
  return clamp(offsetCm, 0, upperBound);
}

export function createGuideId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `guide-${crypto.randomUUID()}`;
  }
  return `guide-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
