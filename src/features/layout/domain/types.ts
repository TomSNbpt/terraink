export interface LayoutGuideTemplate {
  axis: GuideAxis;
  /** Offset from the top-left (0, 0) corner, stored canonically in centimeters. */
  offsetCm: number;
}

export interface Layout {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  unit: "in" | "px";
  widthCm: number;
  heightCm: number;
  symbol: string;
  categoryId: string;
  categoryName: string;
  defaultGuides?: LayoutGuideTemplate[];
}

export interface LayoutGroup {
  id: string;
  name: string;
  options: Layout[];
}

export const CUSTOM_LAYOUT_ID = "custom";

export type GuideAxis = "x" | "y";

export interface LayoutGuide {
  id: string;
  axis: GuideAxis;
  /** Offset from the top-left (0, 0) corner, stored canonically in centimeters. */
  offsetCm: number;
}
