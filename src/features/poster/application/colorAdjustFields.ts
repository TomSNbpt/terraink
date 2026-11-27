import type { PosterForm } from "./posterReducer";

/** The Color tab settings at "no change" (preserves colorKeepAcrossThemes). */
export const COLOR_ADJUST_DEFAULTS: Pick<
  PosterForm,
  | "colorBrightness"
  | "colorContrast"
  | "colorSaturation"
  | "colorHue"
  | "colorWarmth"
  | "colorInvert"
  | "colorGrayscale"
> = {
  colorBrightness: "0",
  colorContrast: "0",
  colorSaturation: "0",
  colorHue: "0",
  colorWarmth: "0",
  colorInvert: false,
  colorGrayscale: false,
};
