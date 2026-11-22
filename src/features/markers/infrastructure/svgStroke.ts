export interface StrokedSvgResult {
  svgMarkup: string;
  viewBox: string;
  innerMarkup: string;
  boxSize: number;
}

const SHAPE_SELECTOR =
  "path, circle, rect, polygon, polyline, ellipse, line";

function fmt(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stripInlinePaint(node: Element): void {
  const styleAttr = node.getAttribute("style");
  if (!styleAttr) return;
  const cleanedStyle = styleAttr
    .replace(/fill\s*:\s*[^;]+;?/gi, "")
    .replace(/stroke\s*:\s*[^;]+;?/gi, "")
    .replace(/stroke-width\s*:\s*[^;]+;?/gi, "");
  if (cleanedStyle.trim()) {
    node.setAttribute("style", cleanedStyle);
  } else {
    node.removeAttribute("style");
  }
}

function parseViewBox(svgEl: SVGSVGElement): [number, number, number, number] {
  const raw = svgEl.getAttribute("viewBox");
  if (raw) {
    const parts = raw
      .trim()
      .split(/[\s,]+/)
      .map((n) => Number(n));
    if (
      parts.length === 4 &&
      parts.every((n) => Number.isFinite(n)) &&
      parts[2] > 0 &&
      parts[3] > 0
    ) {
      return [parts[0], parts[1], parts[2], parts[3]];
    }
  }
  const w = Number(svgEl.getAttribute("width")) || 24;
  const h = Number(svgEl.getAttribute("height")) || 24;
  return [0, 0, w > 0 ? w : 24, h > 0 ? h : 24];
}

export function buildStrokedSvgIcon(
  rawSvg: string,
  size: number,
  fillColor: string | null,
  strokeColor?: string,
  strokeWidthPx?: number,
): StrokedSvgResult | null {
  if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") {
    return null;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(rawSvg, "image/svg+xml");
  const svgEl = doc.querySelector("svg");
  if (!svgEl) return null;

  const [minX, minY, vbW, vbH] = parseViewBox(svgEl);
  const serializer = new XMLSerializer();

  const fillRoot = svgEl.cloneNode(true) as SVGSVGElement;
  if (fillColor) {
    for (const def of Array.from(fillRoot.querySelectorAll("defs"))) {
      def.remove();
    }
    for (const node of Array.from(fillRoot.querySelectorAll(SHAPE_SELECTOR))) {
      stripInlinePaint(node);
      const existingFill = node.getAttribute("fill");
      if (existingFill !== "none") {
        node.setAttribute("fill", fillColor);
      }
      const existingStroke = node.getAttribute("stroke");
      if (existingStroke && existingStroke !== "none") {
        node.setAttribute("stroke", fillColor);
      }
    }
  }

  const fillInner = Array.from(fillRoot.childNodes)
    .map((child) => serializer.serializeToString(child))
    .join("")
    .split("currentColor")
    .join(fillColor ?? "#000000");

  const hasStroke =
    Boolean(strokeColor) &&
    typeof strokeWidthPx === "number" &&
    Number.isFinite(strokeWidthPx) &&
    strokeWidthPx > 0 &&
    size > 0;

  if (!hasStroke) {
    const viewBox = `${fmt(minX)} ${fmt(minY)} ${fmt(vbW)} ${fmt(vbH)}`;
    const colorAttrs = fillColor
      ? ` color="${escapeXmlAttr(fillColor)}" fill="${escapeXmlAttr(fillColor)}"`
      : "";
    const svgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(size)}" height="${fmt(size)}" viewBox="${escapeXmlAttr(viewBox)}"${colorAttrs}>${fillInner}</svg>`;
    return {
      svgMarkup,
      viewBox,
      innerMarkup: fillInner,
      boxSize: size,
    };
  }

  const vbMax = Math.max(vbW, vbH);
  const vbPerPx = vbMax / size;
  const vbStrokeHalf = strokeWidthPx! * vbPerPx;
  const vbStrokeFull = vbStrokeHalf * 2;
  const padVb = vbStrokeHalf * 1.25;

  const expandedViewBox = `${fmt(minX - padVb)} ${fmt(minY - padVb)} ${fmt(vbW + padVb * 2)} ${fmt(vbH + padVb * 2)}`;
  const boxSize = size + 2 * (padVb / vbPerPx);

  const strokeRoot = svgEl.cloneNode(true) as SVGSVGElement;
  for (const def of Array.from(strokeRoot.querySelectorAll("defs"))) {
    def.remove();
  }
  for (const node of Array.from(strokeRoot.querySelectorAll(SHAPE_SELECTOR))) {
    stripInlinePaint(node);
    node.setAttribute("fill", "none");
    node.setAttribute("stroke", strokeColor!);
    node.setAttribute("stroke-width", fmt(vbStrokeFull));
    node.setAttribute("stroke-linejoin", "round");
    node.setAttribute("stroke-linecap", "round");
  }

  const strokeInner = Array.from(strokeRoot.childNodes)
    .map((child) => serializer.serializeToString(child))
    .join("")
    .split("currentColor")
    .join(strokeColor!);

  const innerMarkup = `<g fill="none" stroke="${escapeXmlAttr(strokeColor!)}" stroke-width="${fmt(vbStrokeFull)}" stroke-linejoin="round" stroke-linecap="round">${strokeInner}</g><g${fillColor ? ` fill="${escapeXmlAttr(fillColor)}" color="${escapeXmlAttr(fillColor)}"` : ""}>${fillInner}</g>`;
  const svgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(boxSize)}" height="${fmt(boxSize)}" viewBox="${escapeXmlAttr(expandedViewBox)}">${innerMarkup}</svg>`;

  return {
    svgMarkup,
    viewBox: expandedViewBox,
    innerMarkup,
    boxSize,
  };
}
