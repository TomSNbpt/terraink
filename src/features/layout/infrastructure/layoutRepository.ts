import appConfig from "@/data/config.json";
import { CM_PER_INCH } from "@/core/config";
import { OUTPUT_DPI } from "@/features/poster/infrastructure/renderer/constants";
import { toPositiveNumber } from "@/shared/utils/number";
import { createGuideId } from "../domain/guides";
import type {
  Layout,
  LayoutGroup,
  LayoutGuide,
  LayoutGuideTemplate,
} from "../domain/types";

const fallbackSymbol =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 40'><rect x='2' y='2' width='60' height='36' rx='5' fill='none' stroke='#9CC3DA' stroke-width='2'/><rect x='14' y='8' width='36' height='24' rx='3' fill='#4B91B7'/></svg>";

const fallbackLayout: Layout = {
  id: "print_poster_20x30",
  name: "Poster 8 x 12 in",
  description: "Classic portrait poster size (2:3 ratio).",
  width: Number((20 / CM_PER_INCH).toFixed(2)),
  height: Number((30 / CM_PER_INCH).toFixed(2)),
  unit: "in",
  widthCm: 20,
  heightCm: 30,
  symbol: fallbackSymbol,
  categoryId: "print",
  categoryName: "Print",
};

function normalizeRawUnit(value: unknown): "cm" | "in" | "px" {
  const unit = String(value ?? "")
    .trim()
    .toLowerCase();
  if (unit === "px") return "px";
  if (unit === "in") return "in";
  return "cm";
}

function formatDecimal(value: number): string {
  const rounded = Math.round(Number(value) * 100) / 100;
  return String(rounded);
}

function createSymbolFromRatio(width: number, height: number): string {
  const ratio = Math.max(0.15, Math.min(6, width / height));
  const maxInnerWidth = 50;
  const maxInnerHeight = 30;

  let innerWidth = maxInnerWidth;
  let innerHeight = innerWidth / ratio;

  if (innerHeight > maxInnerHeight) {
    innerHeight = maxInnerHeight;
    innerWidth = innerHeight * ratio;
  }

  const x = (64 - innerWidth) / 2;
  const y = (40 - innerHeight) / 2;
  const roundedX = Number(x.toFixed(2));
  const roundedY = Number(y.toFixed(2));
  const roundedWidth = Number(innerWidth.toFixed(2));
  const roundedHeight = Number(innerHeight.toFixed(2));

  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 40'><rect x='2' y='2' width='60' height='36' rx='5' fill='none' stroke='#9CC3DA' stroke-width='2'/><rect x='${roundedX}' y='${roundedY}' width='${roundedWidth}' height='${roundedHeight}' rx='3' fill='#4B91B7'/></svg>`;
}

function normalizeLayoutGuides(
  rawGuides: unknown,
  fallbackUnit: "cm" | "in" | "px",
): LayoutGuideTemplate[] {
  if (!Array.isArray(rawGuides)) return [];

  const result: LayoutGuideTemplate[] = [];
  for (const item of rawGuides) {
    if (!item || typeof item !== "object") continue;
    const axis = (item as any).axis;
    if (axis !== "x" && axis !== "y") continue;

    let offsetCm: number | null = null;
    if (
      typeof (item as any).offsetCm === "number" &&
      Number.isFinite((item as any).offsetCm) &&
      (item as any).offsetCm >= 0
    ) {
      offsetCm = (item as any).offsetCm;
    } else if (
      typeof (item as any).offset === "number" &&
      Number.isFinite((item as any).offset) &&
      (item as any).offset >= 0
    ) {
      const unit = normalizeRawUnit((item as any).unit ?? fallbackUnit);
      const rawOffset = (item as any).offset;
      if (unit === "in") {
        offsetCm = rawOffset * CM_PER_INCH;
      } else if (unit === "px") {
        offsetCm = (rawOffset / OUTPUT_DPI) * CM_PER_INCH;
      } else {
        offsetCm = rawOffset;
      }
    }

    if (offsetCm !== null && Number.isFinite(offsetCm) && offsetCm >= 0) {
      result.push({ axis, offsetCm });
    }
  }

  return result;
}

function normalizeLayout(
  category: { id: string; name: string },
  layout: any,
  fallbackIdSuffix: string | number,
): Layout {
  const rawWidth = toPositiveNumber(layout?.width, fallbackLayout.widthCm);
  const rawHeight = toPositiveNumber(layout?.height, fallbackLayout.heightCm);
  const rawUnit = normalizeRawUnit(layout?.unit);

  const widthCm = toPositiveNumber(
    layout?.posterWidthCm,
    rawUnit === "in"
      ? rawWidth * CM_PER_INCH
      : rawUnit === "cm"
        ? rawWidth
        : fallbackLayout.widthCm,
  );
  const heightCm = toPositiveNumber(
    layout?.posterHeightCm,
    rawUnit === "in"
      ? rawHeight * CM_PER_INCH
      : rawUnit === "cm"
        ? rawHeight
        : fallbackLayout.heightCm,
  );

  const unit: "in" | "px" = rawUnit === "px" ? "px" : "in";
  const width =
    rawUnit === "cm"
      ? Number((rawWidth / CM_PER_INCH).toFixed(2))
      : rawWidth;
  const height =
    rawUnit === "cm"
      ? Number((rawHeight / CM_PER_INCH).toFixed(2))
      : rawHeight;

  const rawSymbol = String(layout?.symbol ?? "").trim();
  const defaultGuides = normalizeLayoutGuides(layout?.guides, rawUnit);

  return {
    id: String(layout?.id ?? `${category.id}_${fallbackIdSuffix}`),
    name: String(layout?.name ?? "Unnamed Layout"),
    description: String(layout?.description ?? "").trim(),
    width,
    height,
    unit,
    widthCm,
    heightCm,
    symbol: rawSymbol || createSymbolFromRatio(width, height),
    categoryId: category.id,
    categoryName: category.name,
    defaultGuides,
  };
}

const layoutsManifest = (appConfig as any)?.layouts ?? appConfig;

const rawCategories = Array.isArray((layoutsManifest as any)?.categories)
  ? (layoutsManifest as any).categories
  : [];

export const layoutGroups: LayoutGroup[] = rawCategories
  .map((category: any, categoryIndex: number) => {
    const categoryId = String(category?.id ?? `category_${categoryIndex}`);
    const categoryName = String(category?.name ?? categoryId);
    const rawLayouts = Array.isArray(category?.layouts) ? category.layouts : [];
    const options = rawLayouts.map((layout: any, layoutIndex: number) =>
      normalizeLayout(
        { id: categoryId, name: categoryName },
        layout,
        layoutIndex,
      ),
    );

    return { id: categoryId, name: categoryName, options };
  })
  .filter((group: LayoutGroup) => group.options.length > 0);

export const layoutOptions: Layout[] = layoutGroups.flatMap(
  (group) => group.options,
);

const layoutOptionsById: Record<string, Layout> = layoutOptions.reduce(
  (acc: Record<string, Layout>, option) => {
    if (!acc[option.id]) acc[option.id] = option;
    return acc;
  },
  {},
);

const manifestDefaultId = String(
  (layoutsManifest as any)?.defaultLayoutId ?? "",
).trim();

export const defaultLayoutId: string = layoutOptionsById[manifestDefaultId]
  ? manifestDefaultId
  : (layoutOptions[0]?.id ?? fallbackLayout.id);

export function formatLayoutDimensions(layoutOption: Layout): string {
  if (!layoutOption) return "";
  return `${formatDecimal(layoutOption.width)} x ${formatDecimal(layoutOption.height)} ${layoutOption.unit}`;
}

export function getLayoutOption(layoutId: string): Layout | null {
  const normalizedId = String(layoutId ?? "").trim();
  if (normalizedId === "custom") return null;
  if (layoutOptionsById[normalizedId]) return layoutOptionsById[normalizedId];
  if (layoutOptionsById[defaultLayoutId])
    return layoutOptionsById[defaultLayoutId];
  return fallbackLayout;
}

export function createCustomLayoutOption(
  widthCm: number,
  heightCm: number,
  unit: "in" | "px" = "in",
): Layout {
  const normalizedWidthCm = toPositiveNumber(widthCm, fallbackLayout.widthCm);
  const normalizedHeightCm = toPositiveNumber(
    heightCm,
    fallbackLayout.heightCm,
  );
  const symbol = createSymbolFromRatio(normalizedWidthCm, normalizedHeightCm);

  const width =
    unit === "px"
      ? Math.max(1, Math.round((normalizedWidthCm / CM_PER_INCH) * OUTPUT_DPI))
      : Number((normalizedWidthCm / CM_PER_INCH).toFixed(2));
  const height =
    unit === "px"
      ? Math.max(1, Math.round((normalizedHeightCm / CM_PER_INCH) * OUTPUT_DPI))
      : Number((normalizedHeightCm / CM_PER_INCH).toFixed(2));

  return {
    id: "custom",
    name: "Custom Layout",
    description: "Manual width and height values.",
    width,
    height,
    unit,
    widthCm: normalizedWidthCm,
    heightCm: normalizedHeightCm,
    symbol,
    categoryId: "custom",
    categoryName: "Custom",
  };
}

export function instantiateLayoutGuides(
  layoutOption: Layout | null | undefined,
): LayoutGuide[] {
  const templates = layoutOption?.defaultGuides ?? [];
  return templates.map((template) => ({
    id: createGuideId(),
    axis: template.axis,
    offsetCm: template.offsetCm,
  }));
}
