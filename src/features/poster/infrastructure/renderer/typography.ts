import { formatCoordinates } from "@/shared/geo/posterBounds";
import type { Coordinate } from "@/shared/geo/types";
import {
  TEXT_DIMENSION_REFERENCE_PX,
  TEXT_CITY_Y_RATIO,
  TEXT_DIVIDER_Y_RATIO,
  TEXT_COUNTRY_Y_RATIO,
  TEXT_COORDS_Y_RATIO,
  CITY_FONT_BASE_PX,
  COUNTRY_FONT_BASE_PX,
  COORDS_FONT_BASE_PX,
  formatCityLabel,
  computeCityFontScale,
} from "@/features/poster/domain/textLayout";
import type { TrimRect } from "@/features/layout/domain/bleed";

export function drawPosterText(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme: { ui?: { text?: string }; map?: { land?: string } },
  center: Coordinate,
  city: string,
  country: string,
  fontFamily: string | undefined,
  showPosterText: boolean,
  _showOverlay: boolean,
  _includeCredits: boolean = false,
  trimRect?: TrimRect,
): void {
  if (!showPosterText) return;

  const tx = trimRect?.x ?? 0;
  const ty = trimRect?.y ?? 0;
  const tw = trimRect?.width ?? width;
  const th = trimRect?.height ?? height;

  const textColor = theme.ui?.text || "#111111";
  const titleFontFamily = fontFamily
    ? `"${fontFamily}", "Space Grotesk", sans-serif`
    : '"Space Grotesk", sans-serif';
  const bodyFontFamily = fontFamily
    ? `"${fontFamily}", "IBM Plex Mono", monospace`
    : '"IBM Plex Mono", monospace';

  const dimScale = Math.max(
    0.45,
    Math.min(tw, th) / TEXT_DIMENSION_REFERENCE_PX,
  );

  const cityLabel = formatCityLabel(city);
  const cityFontSize = CITY_FONT_BASE_PX * dimScale * computeCityFontScale(city);

  const countryFontSize = COUNTRY_FONT_BASE_PX * dimScale;
  const coordinateFontSize = COORDS_FONT_BASE_PX * dimScale;
  const centerX = tx + tw * 0.5;
  const cityY = ty + th * TEXT_CITY_Y_RATIO;
  const lineY = ty + th * TEXT_DIVIDER_Y_RATIO;
  const countryY = ty + th * TEXT_COUNTRY_Y_RATIO;
  const coordinatesY = ty + th * TEXT_COORDS_Y_RATIO;

  ctx.fillStyle = textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${cityFontSize}px ${titleFontFamily}`;
  ctx.fillText(cityLabel, centerX, cityY);

  ctx.strokeStyle = textColor;
  ctx.lineWidth = 3 * dimScale;
  ctx.beginPath();
  ctx.moveTo(tx + tw * 0.4, lineY);
  ctx.lineTo(tx + tw * 0.6, lineY);
  ctx.stroke();

  ctx.font = `300 ${countryFontSize}px ${titleFontFamily}`;
  ctx.fillText(country.toUpperCase(), centerX, countryY);

  ctx.globalAlpha = 0.75;
  ctx.font = `400 ${coordinateFontSize}px ${bodyFontFamily}`;
  ctx.fillText(
    formatCoordinates(center.lat, center.lon),
    centerX,
    coordinatesY,
  );
  ctx.globalAlpha = 1;
}
