import { CM_PER_INCH } from "@/core/config";
import {
  DEFAULT_BLEED_INCHES,
  type UserDefaults,
} from "@/features/settings/domain/types";

export interface TrimRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BleedLayoutMetrics {
  trimWidthCm: number;
  trimHeightCm: number;
  trimWidthInches: number;
  trimHeightInches: number;
  bleedInches: number;
  bleedCm: number;
  totalWidthCm: number;
  totalHeightCm: number;
  totalWidthInches: number;
  totalHeightInches: number;
  bleedRatioX: number;
  bleedRatioY: number;
  bleedPercentX: number;
  bleedPercentY: number;
}

export function normalizeBleedInches(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_BLEED_INCHES;
  }
  return Math.min(24, Math.round(parsed * 1000) / 1000);
}

export function resolveBleedInches(defaults?: UserDefaults | null): number {
  if (
    typeof defaults?.bleedInches === "number" &&
    Number.isFinite(defaults.bleedInches) &&
    defaults.bleedInches >= 0
  ) {
    return normalizeBleedInches(defaults.bleedInches);
  }
  return DEFAULT_BLEED_INCHES;
}

export function computeBleedLayoutMetrics(
  widthCm: number,
  heightCm: number,
  bleedInches: number,
): BleedLayoutMetrics {
  const safeWidthCm =
    Number.isFinite(widthCm) && widthCm > 0 ? widthCm : CM_PER_INCH;
  const safeHeightCm =
    Number.isFinite(heightCm) && heightCm > 0 ? heightCm : CM_PER_INCH;
  const safeBleedInches = normalizeBleedInches(bleedInches);
  const bleedCm = safeBleedInches * CM_PER_INCH;

  const trimWidthInches = safeWidthCm / CM_PER_INCH;
  const trimHeightInches = safeHeightCm / CM_PER_INCH;
  const totalWidthCm = safeWidthCm + 2 * bleedCm;
  const totalHeightCm = safeHeightCm + 2 * bleedCm;
  const totalWidthInches = trimWidthInches + 2 * safeBleedInches;
  const totalHeightInches = trimHeightInches + 2 * safeBleedInches;

  const bleedRatioX = safeWidthCm > 0 ? bleedCm / safeWidthCm : 0;
  const bleedRatioY = safeHeightCm > 0 ? bleedCm / safeHeightCm : 0;

  return {
    trimWidthCm: safeWidthCm,
    trimHeightCm: safeHeightCm,
    trimWidthInches,
    trimHeightInches,
    bleedInches: safeBleedInches,
    bleedCm,
    totalWidthCm,
    totalHeightCm,
    totalWidthInches,
    totalHeightInches,
    bleedRatioX,
    bleedRatioY,
    bleedPercentX: bleedRatioX * 100,
    bleedPercentY: bleedRatioY * 100,
  };
}

export function computeExportTrimRect(
  exportWidth: number,
  exportHeight: number,
  metrics: BleedLayoutMetrics,
): TrimRect {
  if (metrics.bleedInches <= 0 || metrics.totalWidthInches <= 0 || metrics.totalHeightInches <= 0) {
    return {
      x: 0,
      y: 0,
      width: exportWidth,
      height: exportHeight,
    };
  }

  const x = (metrics.bleedInches / metrics.totalWidthInches) * exportWidth;
  const y = (metrics.bleedInches / metrics.totalHeightInches) * exportHeight;
  const width = (metrics.trimWidthInches / metrics.totalWidthInches) * exportWidth;
  const height =
    (metrics.trimHeightInches / metrics.totalHeightInches) * exportHeight;

  return { x, y, width, height };
}

export function formatInchesNumber(inches: number): string {
  const rounded = Math.round(inches * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}
