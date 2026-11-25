import { GoogleGenAI, ThinkingLevel } from "@google/genai";

export interface BrandSourceInfo {
  name: string;
  url: string;
  domain: string;
  logoColors: string[];
  siteColors: string[];
}

export interface BrandResearchResult {
  source: BrandSourceInfo;
  pageTitle: string;
  brandSummary: string;
  cssBrandVars: Array<{ name: string; hex: string }>;
  logoImage?: {
    mimeType: "image/png" | "image/jpeg" | "image/webp";
    data: string;
    sourceUrl: string;
  };
}

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const BLOCKED_AGGREGATOR_HOSTS = new Set([
  "wikipedia.org",
  "en.wikipedia.org",
  "facebook.com",
  "www.facebook.com",
  "instagram.com",
  "www.instagram.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "www.youtube.com",
  "tiktok.com",
  "www.tiktok.com",
  "reddit.com",
  "www.reddit.com",
  "pinterest.com",
  "www.pinterest.com",
  "linkedin.com",
  "www.linkedin.com",
  "yelp.com",
  "www.yelp.com",
  "tripadvisor.com",
  "www.tripadvisor.com",
  "amazon.com",
  "www.amazon.com",
]);

const SKIP_CSS_PATTERNS = [
  /fonts\.googleapis\.com/i,
  /use\.typekit\.net/i,
  /fontawesome|font-awesome/i,
  /bootstrap/i,
  /datepicker/i,
  /tooltipster/i,
  /the-events-calendar/i,
  /tribe-/i,
  /woocommerce/i,
  /slick|swiper|owl\.carousel/i,
  /cookie|gdpr|onetrust|termly/i,
  /jquery|normalize|reset|animate\.min/i,
  /wp-includes\/css\/dist\/block-library/i,
  /dashicons|admin-bar/i,
];

const PREFERRED_CSS_PATTERNS = [
  /wp-content\/themes\//i,
  /elementor\/css\/post-/i,
  /elementor\/css\/global/i,
  /(?:^|\/)(?:main|app|site|style|styles|theme|brand|custom|global)[^/]*\.css/i,
];

const NAMED_CSS_COLORS: Record<string, string> = {
  navy: "#000080",
  darkblue: "#00008B",
  royalblue: "#4169E1",
  crimson: "#DC143C",
  firebrick: "#B22222",
  darkred: "#8B0000",
  gold: "#FFD700",
  goldenrod: "#DAA520",
  orange: "#FFA500",
  darkorange: "#FF8C00",
  teal: "#008080",
  forestgreen: "#228B22",
  darkgreen: "#006400",
  seagreen: "#2E8B57",
  indigo: "#4B0082",
  purple: "#800080",
  maroon: "#800000",
  coral: "#FF7F50",
  tomato: "#FF6347",
  turquoise: "#40E0D0",
  steelblue: "#4682B4",
  midnightblue: "#191970",
};

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const RECOGNIZED_TLDS =
  "com|org|net|io|gov|edu|co|run|race|us|uk|ca|de|fr|jp|au|nz|eu|ch|es|it|nl|se|no|dk|info|events|sport|club|nyc|london|berlin|tokyo|paris|app|site|world|me|tv|cc";

const BARE_DOMAIN_RE = new RegExp(
  `(?:^|[\\s(\\[])((?:www\\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\\.(?:${RECOGNIZED_TLDS})(?:\\/[^\\s<>"')\\]}]*)?)(?=$|[\\s),.!?;:\\]])`,
  "i",
);

export function normalizeUrlInput(raw: string): string | null {
  const trimmed = raw
    .trim()
    .replace(/^[<(\["']+/, "")
    .replace(/[.,!?;:>)\]"']+$/, "");
  if (!trimmed) return null;
  const withProto = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : /^[a-z0-9.-]+\.[a-z]{2,}(?:\/|$)/i.test(trimmed)
      ? `https://${trimmed}`
      : "";
  if (!withProto) return null;
  try {
    const parsed = new URL(withProto);
    if (isSafePublicUrl(parsed.toString())) {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

export function extractExplicitUrl(text: string): string | null {
  const fullMatch = text.match(/https?:\/\/[^\s<>"')\]}]+/i);
  if (fullMatch) {
    const normalized = normalizeUrlInput(fullMatch[0]);
    if (normalized) return normalized;
  }

  const bareMatch = text.match(BARE_DOMAIN_RE);
  if (bareMatch?.[1]) {
    const normalized = normalizeUrlInput(bareMatch[1]);
    if (normalized) return normalized;
  }

  return null;
}

function isPrivateOrBlockedHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !host ||
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".localhost")
  ) {
    return true;
  }

  // IPv6 private/link-local
  if (host.includes(":")) {
    if (
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe80") ||
      host === "::"
    ) {
      return true;
    }
    return false;
  }

  // IPv4 literal check
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [a, b] = [Number(ipv4Match[1]), Number(ipv4Match[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }

  return false;
}

export function isSafePublicUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    if (isPrivateOrBlockedHost(parsed.hostname)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function safeFetchPublic(
  rawUrl: string,
  options: { timeoutMs: number; maxBytes: number; accept: string },
): Promise<{
  finalUrl: string;
  contentType: string;
  buffer: Buffer;
} | null> {
  let currentUrl = rawUrl;

  for (let hop = 0; hop < 6; hop += 1) {
    if (!isSafePublicUrl(currentUrl)) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(currentUrl, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": BROWSER_USER_AGENT,
          Accept: options.accept,
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      clearTimeout(timer);

      if (
        response.status >= 300 &&
        response.status < 400 &&
        response.headers.get("location")
      ) {
        const nextUrl = new URL(
          response.headers.get("location")!,
          currentUrl,
        ).toString();
        currentUrl = nextUrl;
        continue;
      }

      if (!response.ok) return null;

      const contentLength = Number(response.headers.get("content-length") ?? "0");
      if (Number.isFinite(contentLength) && contentLength > options.maxBytes) {
        return null;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        const arr = Buffer.from(await response.arrayBuffer());
        if (arr.byteLength > options.maxBytes) return null;
        return {
          finalUrl: currentUrl,
          contentType: (response.headers.get("content-type") ?? "").toLowerCase(),
          buffer: arr,
        };
      }

      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > options.maxBytes) {
            try {
              await reader.cancel();
            } catch {
              // ignore
            }
            // For HTML/CSS, keep the prefix we already read; for images abort.
            if (options.accept.includes("image/")) {
              return null;
            }
            break;
          }
          chunks.push(value);
        }
      }

      return {
        finalUrl: currentUrl,
        contentType: (response.headers.get("content-type") ?? "").toLowerCase(),
        buffer: Buffer.concat(chunks),
      };
    } catch {
      clearTimeout(timer);
      return null;
    }
  }

  return null;
}

function rgbToHex({ r, g, b }: Rgb): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

function hexToRgb(hex: string): Rgb | null {
  const clean = hex.trim().replace(/^#/, "");
  if (clean.length === 3 && /^[0-9a-f]{3}$/i.test(clean)) {
    return {
      r: Number.parseInt(clean[0] + clean[0], 16),
      g: Number.parseInt(clean[1] + clean[1], 16),
      b: Number.parseInt(clean[2] + clean[2], 16),
    };
  }
  if (clean.length === 6 && /^[0-9a-f]{6}$/i.test(clean)) {
    return {
      r: Number.parseInt(clean.slice(0, 2), 16),
      g: Number.parseInt(clean.slice(2, 4), 16),
      b: Number.parseInt(clean.slice(4, 6), 16),
    };
  }
  if (clean.length === 8 && /^[0-9a-f]{8}$/i.test(clean)) {
    const alpha = Number.parseInt(clean.slice(6, 8), 16);
    if (alpha < 120) return null;
    return {
      r: Number.parseInt(clean.slice(0, 2), 16),
      g: Number.parseInt(clean.slice(2, 4), 16),
      b: Number.parseInt(clean.slice(4, 6), 16),
    };
  }
  return null;
}

function parseColorToken(token: string): string | null {
  const trimmed = token.trim().toLowerCase();
  if (trimmed.startsWith("#")) {
    const rgb = hexToRgb(trimmed);
    return rgb ? rgbToHex(rgb) : null;
  }
  const rgbMatch = trimmed.match(
    /^rgba?\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})(?:\s*[,/]\s*([0-9.]+%?))?\s*\)$/,
  );
  if (rgbMatch) {
    const r = Number(rgbMatch[1]);
    const g = Number(rgbMatch[2]);
    const b = Number(rgbMatch[3]);
    const alphaRaw = rgbMatch[4];
    if (alphaRaw !== undefined) {
      const alpha = alphaRaw.endsWith("%")
        ? Number.parseFloat(alphaRaw) / 100
        : Number.parseFloat(alphaRaw);
      if (Number.isFinite(alpha) && alpha < 0.45) return null;
    }
    if (r <= 255 && g <= 255 && b <= 255) {
      return rgbToHex({ r, g, b });
    }
  }
  if (NAMED_CSS_COLORS[trimmed]) {
    return NAMED_CSS_COLORS[trimmed];
  }
  return null;
}

function rgbStats(rgb: Rgb): { saturation: number; lightness: number; chroma: number } {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  const lightness = (max + min) / 2;
  const saturation =
    chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * lightness - 1));
  return { saturation, lightness, chroma };
}

function isBoringNeutral(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return true;
  const { saturation, lightness, chroma } = rgbStats(rgb);
  // Pure/near white or pure/near black
  if (lightness > 0.94 || lightness < 0.05) return true;
  // Flat gray (almost zero chroma)
  if (chroma < 0.075 && saturation < 0.14) return true;
  return false;
}

function colorDistance(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function clusterWeightedColors(
  weighted: Map<string, number>,
  limit: number,
  minDistance = 30,
  allowDarkNeutrals = false,
): string[] {
  const entries = [...weighted.entries()]
    .map(([hex, weight]) => {
      const rgb = hexToRgb(hex);
      if (!rgb) return null;
      const stats = rgbStats(rgb);
      if (isBoringNeutral(hex)) {
        if (!allowDarkNeutrals || stats.lightness > 0.24 || stats.lightness < 0.06) {
          return null;
        }
      }
      // Boost chromatic brand colors over near-neutral grays
      const chromaBoost = 0.65 + stats.chroma * 1.6;
      return { hex, rgb, score: weight * chromaBoost };
    })
    .filter((entry): entry is { hex: string; rgb: Rgb; score: number } => entry !== null)
    .sort((a, b) => b.score - a.score);

  const selected: Array<{ hex: string; rgb: Rgb }> = [];
  for (const candidate of entries) {
    if (selected.some((kept) => colorDistance(kept.rgb, candidate.rgb) < minDistance)) {
      continue;
    }
    selected.push({ hex: candidate.hex, rgb: candidate.rgb });
    if (selected.length >= limit) break;
  }
  return selected.map((item) => item.hex);
}

function extractCssColors(cssText: string): {
  brandVars: Array<{ name: string; hex: string }>;
  weighted: Map<string, number>;
} {
  const weighted = new Map<string, number>();
  const brandVars: Array<{ name: string; hex: string }> = [];
  const seenVarNames = new Set<string>();

  const addWeight = (hex: string, amount: number) => {
    weighted.set(hex, (weighted.get(hex) ?? 0) + amount);
  };

  // 1. Named CSS custom properties (--primary, --brand, --accent, WP presets, Elementor globals)
  const varRegex =
    /(--[a-z0-9_-]{2,64})\s*:\s*(#[0-9a-f]{3,8}|rgba?\([^)]{3,40}\))/gi;
  let match: RegExpExecArray | null;
  while ((match = varRegex.exec(cssText)) !== null) {
    const varName = match[1].toLowerCase();
    const hex = parseColorToken(match[2]);
    if (!hex) continue;
    const looksBranded =
      /(primary|secondary|accent|brand|theme|main|hero|highlight|navy|blue|gold|red|green|orange|purple|teal|global-color|preset--color|button|cta|nav|header)/i.test(
        varName,
      );
    const looksUtilityJunk =
      /(wp-admin|wp--preset--color--(white|black|cyan-bluish-gray|pale-pink|vivid-red|luminous-vivid-amber|luminous-vivid-orange|light-green-cyan|vivid-green-cyan|pale-cyan-blue|vivid-cyan-blue|vivid-purple)|bs-|tw-|gray|grey|neutral|slate|zinc|stone|border|shadow|error|danger|warning|success|info|muted|disabled)/i.test(
        varName,
      );

    if (looksBranded && !looksUtilityJunk && !isBoringNeutral(hex)) {
      addWeight(hex, 12);
      if (!seenVarNames.has(varName) && brandVars.length < 12) {
        seenVarNames.add(varName);
        brandVars.push({ name: varName, hex });
      }
    } else if (!looksUtilityJunk && !isBoringNeutral(hex)) {
      addWeight(hex, 3);
    }
  }

  // 2. General hex and rgb() declarations in CSS
  const declRegex =
    /(background-color|background|color|fill|stroke|border-color)\s*:\s*([^;{}]{1,120})/gi;
  while ((match = declRegex.exec(cssText)) !== null) {
    const prop = match[1].toLowerCase();
    const val = match[2];
    const baseWeight =
      prop === "background-color" || prop === "background"
        ? 3
        : prop === "fill" || prop === "stroke"
          ? 2.5
          : 1.5;

    const colorMatches = val.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]{3,40}\)/gi);
    if (!colorMatches) continue;
    for (const token of colorMatches) {
      const hex = parseColorToken(token);
      if (hex) {
        addWeight(hex, baseWeight);
      }
    }
  }

  return { brandVars, weighted };
}

function extractSvgColors(svgText: string): string[] {
  const weighted = new Map<string, number>();
  const add = (hex: string, amount: number) => {
    weighted.set(hex, (weighted.get(hex) ?? 0) + amount);
  };

  const attrRegex =
    /(?:fill|stroke|stop-color)\s*[:=]\s*["']?\s*(#[0-9a-f]{3,8}|rgba?\([^)"']+\)|[a-z]+)\s*["']?/gi;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(svgText)) !== null) {
    const hex = parseColorToken(match[1]);
    if (hex) add(hex, 3);
  }

  return clusterWeightedColors(weighted, 6, 28, true);
}

function getAttr(tag: string, attrName: string): string {
  const regex = new RegExp(
    `(?:^|\\s)${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i",
  );
  const match = tag.match(regex);
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

interface LogoCandidate {
  url: string;
  score: number;
  kind: "logo" | "icon" | "og";
}

function extractStylesheetUrls(html: string, baseUrl: string): string[] {
  const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];
  const scored: Array<{ url: string; score: number }> = [];
  const seen = new Set<string>();

  let baseHost = "";
  try {
    baseHost = new URL(baseUrl).hostname.replace(/^www\./, "");
  } catch {
    baseHost = "";
  }

  for (const tag of linkTags) {
    const rel = getAttr(tag, "rel").toLowerCase();
    if (!rel.includes("stylesheet")) continue;
    const rawHref = decodeHtmlEntities(getAttr(tag, "href"));
    if (!rawHref || rawHref.startsWith("data:")) continue;

    let resolved: string;
    try {
      resolved = new URL(rawHref, baseUrl).toString();
    } catch {
      continue;
    }
    if (!isSafePublicUrl(resolved) || seen.has(resolved)) continue;
    if (SKIP_CSS_PATTERNS.some((pattern) => pattern.test(resolved))) continue;
    seen.add(resolved);

    let score = 10;
    try {
      const host = new URL(resolved).hostname.replace(/^www\./, "");
      if (host === baseHost || host.endsWith(`.${baseHost}`)) {
        score += 20;
      }
    } catch {
      // ignore
    }
    for (const pattern of PREFERRED_CSS_PATTERNS) {
      if (pattern.test(resolved)) score += 25;
    }
    scored.push({ url: resolved, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.url);
}

function extractLogoCandidates(html: string, baseUrl: string): {
  candidates: LogoCandidate[];
  inlineSvgLogoColors: string[];
} {
  const candidates: LogoCandidate[] = [];
  const seen = new Set<string>();
  const inlineSvgLogoColors: string[] = [];

  const bodyStart = html.search(/<body\b/i);
  const bodyHtml = bodyStart >= 0 ? html.slice(bodyStart) : html;

  const headerSection =
    bodyHtml.match(/<header\b[\s\S]*?<\/header>/i)?.[0] ??
    bodyHtml.match(/<nav\b[\s\S]*?<\/nav>/i)?.[0] ??
    bodyHtml.slice(0, 40_000);

  // Check inline SVG logos inside header/nav
  const svgMatches = headerSection.match(/<svg\b[\s\S]*?<\/svg>/gi) ?? [];
  for (const svg of svgMatches.slice(0, 6)) {
    if (/logo|brand|lock-?up|wordmark|site-title/i.test(svg) || svg.length > 450) {
      const colors = extractSvgColors(svg);
      for (const hex of colors) {
        if (!inlineSvgLogoColors.includes(hex)) {
          inlineSvgLogoColors.push(hex);
        }
      }
    }
  }

  const pushCandidate = (
    rawUrl: string,
    score: number,
    kind: LogoCandidate["kind"],
  ) => {
    const decoded = decodeHtmlEntities(rawUrl);
    if (!decoded || decoded.startsWith("data:")) return;
    let resolved: string;
    try {
      resolved = new URL(decoded, baseUrl).toString();
    } catch {
      return;
    }
    if (!isSafePublicUrl(resolved) || seen.has(resolved)) return;
    if (/\.ico(?:\?|$)/i.test(resolved)) return;
    seen.add(resolved);
    candidates.push({ url: resolved, score, kind });
  };

  const scanImages = (snippet: string, inHeader: boolean) => {
    const imgTags = snippet.match(/<img\b[^>]*>/gi) ?? [];
    for (const tag of imgTags.slice(0, 80)) {
      const alt = getAttr(tag, "alt");
      const cls = getAttr(tag, "class");
      const id = getAttr(tag, "id");
      const rawSrc =
        getAttr(tag, "data-lazy-src") ||
        getAttr(tag, "data-src") ||
        getAttr(tag, "data-orig-file") ||
        getAttr(tag, "src");
      if (!rawSrc || rawSrc.startsWith("data:")) continue;

      const combined = `${alt} ${cls} ${id} ${rawSrc}`;
      if (
        /sponsor|partner|facebook|instagram|twitter|youtube|tiktok|linkedin|pixel|analytics|gravatar|avatar/i.test(
          combined,
        )
      ) {
        continue;
      }

      let score = inHeader ? 35 : 5;
      if (/logo|lock-?up|wordmark|custom-logo|site-logo|navbar-brand/i.test(combined)) {
        score += 55;
      }
      if (/marathon|race|official|brand|emblem|crest|badge/i.test(combined)) {
        score += 18;
      }
      if (/\.svg(?:\?|$)/i.test(rawSrc)) score += 14;
      if (/\.png(?:\?|$)/i.test(rawSrc)) score += 12;
      if (/\.jpe?g(?:\?|$)/i.test(rawSrc)) score -= 8;

      if (score >= 45) {
        pushCandidate(rawSrc, score, "logo");
      }
    }
  };

  scanImages(headerSection, true);
  scanImages(bodyHtml.slice(0, 140_000), false);

  // Meta og:image & apple-touch-icon fallbacks (lower priority than real logos)
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metaTags) {
    const prop = (getAttr(tag, "property") || getAttr(tag, "name")).toLowerCase();
    const content = getAttr(tag, "content");
    if ((prop === "og:image" || prop === "twitter:image") && content) {
      pushCandidate(content, 18, "og");
    }
  }

  const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of linkTags) {
    const rel = getAttr(tag, "rel").toLowerCase();
    const href = getAttr(tag, "href");
    if (!href) continue;
    if (rel.includes("apple-touch-icon")) {
      pushCandidate(href, 32, "icon");
    } else if (rel.includes("icon")) {
      pushCandidate(href, 22, "icon");
    }
  }

  return {
    candidates: candidates.sort((a, b) => b.score - a.score).slice(0, 4),
    inlineSvgLogoColors: inlineSvgLogoColors.slice(0, 6),
  };
}

async function analyzeRasterOrSvgLogo(
  buffer: Buffer,
  contentType: string,
  sourceUrl: string,
): Promise<{
  colors: string[];
  logoImage?: BrandResearchResult["logoImage"];
}> {
  const isSvg =
    contentType.includes("svg") ||
    /\.svg(?:\?|$)/i.test(sourceUrl) ||
    buffer.subarray(0, 200).toString("utf8").includes("<svg");

  const svgColors = isSvg ? extractSvgColors(buffer.toString("utf8")) : [];

  try {
    const sharpMod = await import("sharp");
    const sharpFn = sharpMod.default;

    // Normalize image for Gemini vision (compact PNG on neutral check-safe transparent/matte canvas)
    const normalizedPng = await sharpFn(buffer, { limitInputPixels: 16_000_000 })
      .resize({ width: 384, height: 384, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 8 })
      .toBuffer();

    // Extract actual pixel colors from a downsampled raw RGBA bitmap
    const { data, info } = await sharpFn(buffer, { limitInputPixels: 16_000_000 })
      .resize({ width: 96, height: 96, fit: "inside", withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const buckets = new Map<string, { rSum: number; gSum: number; bSum: number; count: number }>();
    const stride = info.channels;
    for (let i = 0; i < data.length; i += stride) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 140) continue;

      // Quantize to 16-step bins so smooth anti-aliased areas group together
      const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
      const existing = buckets.get(key);
      if (existing) {
        existing.rSum += r;
        existing.gSum += g;
        existing.bSum += b;
        existing.count += 1;
      } else {
        buckets.set(key, { rSum: r, gSum: g, bSum: b, count: 1 });
      }
    }

    const weighted = new Map<string, number>();
    for (const bucket of buckets.values()) {
      if (bucket.count < 4) continue;
      const hex = rgbToHex({
        r: bucket.rSum / bucket.count,
        g: bucket.gSum / bucket.count,
        b: bucket.bSum / bucket.count,
      });
      weighted.set(hex, (weighted.get(hex) ?? 0) + bucket.count);
    }

    const pixelColors = clusterWeightedColors(weighted, 6, 34, true);
    const mergedColors = [...new Set([...svgColors, ...pixelColors])].slice(0, 6);

    return {
      colors: mergedColors,
      logoImage: {
        mimeType: "image/png",
        data: normalizedPng.toString("base64"),
        sourceUrl,
      },
    };
  } catch {
    return { colors: svgColors };
  }
}

async function inspectWebsiteBranding(
  targetUrl: string,
  fallbackName: string,
  brandSummary: string,
): Promise<BrandResearchResult | null> {
  const page = await safeFetchPublic(targetUrl, {
    timeoutMs: 7_000,
    maxBytes: 1_500_000,
    accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
  });
  if (!page) return null;

  const html = page.buffer.toString("utf8");
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const pageTitle = decodeHtmlEntities(
    (titleMatch?.[1] ?? "").replace(/\s+/g, " ").trim(),
  );

  // Extract meta theme-color
  const siteWeighted = new Map<string, number>();
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metaTags) {
    const name = getAttr(tag, "name").toLowerCase();
    if (name === "theme-color" || name === "msapplication-tilecolor") {
      const hex = parseColorToken(getAttr(tag, "content"));
      if (hex && !isBoringNeutral(hex)) {
        siteWeighted.set(hex, (siteWeighted.get(hex) ?? 0) + 25);
      }
    }
  }

  // Extract inline <style> blocks
  const styleBlocks = html.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) ?? [];
  const cssBrandVars: Array<{ name: string; hex: string }> = [];
  const seenVarNames = new Set<string>();

  const absorbCss = (cssText: string) => {
    const { brandVars, weighted } = extractCssColors(cssText);
    for (const item of brandVars) {
      if (!seenVarNames.has(item.name) && cssBrandVars.length < 10) {
        seenVarNames.add(item.name);
        cssBrandVars.push(item);
      }
    }
    for (const [hex, weight] of weighted.entries()) {
      siteWeighted.set(hex, (siteWeighted.get(hex) ?? 0) + weight);
    }
  };

  for (const block of styleBlocks.slice(0, 12)) {
    absorbCss(block);
  }

  // Fetch top linked theme stylesheets + candidate logo concurrently
  const stylesheetUrls = extractStylesheetUrls(html, page.finalUrl);
  const { candidates: logoCandidates, inlineSvgLogoColors } =
    extractLogoCandidates(html, page.finalUrl);

  const [cssFiles, logoResult] = await Promise.all([
    Promise.all(
      stylesheetUrls.map((cssUrl) =>
        safeFetchPublic(cssUrl, {
          timeoutMs: 4_000,
          maxBytes: 450_000,
          accept: "text/css,*/*;q=0.1",
        }),
      ),
    ),
    (async () => {
      for (const candidate of logoCandidates) {
        const fetched = await safeFetchPublic(candidate.url, {
          timeoutMs: 4_500,
          maxBytes: 2_500_000,
          accept: "image/svg+xml,image/png,image/webp,image/jpeg,image/*;q=0.8",
        });
        if (!fetched || fetched.buffer.byteLength < 120) continue;
        if (
          !fetched.contentType.includes("image") &&
          !fetched.contentType.includes("svg") &&
          !/\.(svg|png|jpe?g|webp)(?:\?|$)/i.test(fetched.finalUrl)
        ) {
          continue;
        }
        const analyzed = await analyzeRasterOrSvgLogo(
          fetched.buffer,
          fetched.contentType,
          fetched.finalUrl,
        );
        if (analyzed.colors.length > 0 || analyzed.logoImage) {
          return analyzed;
        }
      }
      return { colors: [] as string[], logoImage: undefined };
    })(),
  ]);

  for (const cssFile of cssFiles) {
    if (cssFile) {
      absorbCss(cssFile.buffer.toString("utf8"));
    }
  }

  const logoColors = [
    ...new Set([...logoResult.colors, ...inlineSvgLogoColors]),
  ].slice(0, 6);
  const siteColors = clusterWeightedColors(siteWeighted, 6, 30, true);

  let displayUrl = targetUrl;
  let domain = "";
  try {
    const parsedTarget = new URL(targetUrl);
    domain = parsedTarget.hostname.replace(/^www\./, "");
    displayUrl = parsedTarget.toString();
  } catch {
    try {
      const parsedFinal = new URL(page.finalUrl);
      domain = parsedFinal.hostname.replace(/^www\./, "");
      displayUrl = parsedFinal.toString();
    } catch {
      domain = targetUrl;
    }
  }

  return {
    source: {
      name: fallbackName || pageTitle || domain,
      url: displayUrl,
      domain,
      logoColors,
      siteColors,
    },
    pageTitle,
    brandSummary,
    cssBrandVars,
    logoImage: logoResult.logoImage,
  };
}

function extractJsonSnippet(raw: string): Record<string, unknown> | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function isNonAggregatorPublicUrl(rawUrl: string): boolean {
  if (!isSafePublicUrl(rawUrl)) return false;
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    if (BLOCKED_AGGREGATOR_HOSTS.has(host)) return false;
    for (const blocked of BLOCKED_AGGREGATOR_HOSTS) {
      if (host.endsWith(`.${blocked}`)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function resolveGroundingRedirectUrl(uri: string): Promise<string | null> {
  if (!uri.includes("vertexaisearch.cloud.google.com")) {
    return isNonAggregatorPublicUrl(uri) ? uri : null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_500);
  try {
    const res = await fetch(uri, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
      },
    });
    const location = res.headers.get("location")?.trim() ?? "";
    if (location) {
      const normalized = normalizeUrlInput(location);
      if (normalized && isNonAggregatorPublicUrl(normalized)) {
        return normalized;
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function searchDuckDuckGoOfficialUrl(query: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_500);
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const candidates: string[] = [];

    // DuckDuckGo HTML wraps target URLs in uddg=<encodedUrl>
    const uddgRe = /uddg=([^&"'\s]+)/gi;
    let match: RegExpExecArray | null;
    while ((match = uddgRe.exec(html)) !== null) {
      try {
        const decoded = decodeURIComponent(match[1]);
        const normalized = normalizeUrlInput(decoded);
        if (normalized && isNonAggregatorPublicUrl(normalized)) {
          candidates.push(normalized);
        }
      } catch {
        // ignore malformed result
      }
      if (candidates.length >= 8) break;
    }

    // Prefer homepage-like URLs (shallow path)
    candidates.sort((a, b) => {
      try {
        const pathA = new URL(a).pathname.replace(/\/+$/, "");
        const pathB = new URL(b).pathname.replace(/\/+$/, "");
        return pathA.length - pathB.length;
      } catch {
        return 0;
      }
    });

    return candidates[0] ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function extractUrlFromGroundingChunks(
  chunks: Array<{ web?: { uri?: string; title?: string } }>,
): Promise<string | null> {
  for (const chunk of chunks.slice(0, 6)) {
    const uri = String(chunk?.web?.uri ?? "").trim();
    if (uri) {
      const resolved = await resolveGroundingRedirectUrl(uri);
      if (resolved) return resolved;
    }
    const title = String(chunk?.web?.title ?? "").trim();
    if (title) {
      const fromTitle = extractExplicitUrl(title);
      if (fromTitle && isNonAggregatorPublicUrl(fromTitle)) {
        return fromTitle;
      }
    }
  }
  return null;
}

function parseTruthyFlag(value: unknown): boolean {
  return value === true || String(value ?? "").trim().toLowerCase() === "true";
}

async function discoverOfficialWebsite(
  ai: GoogleGenAI,
  userMessage: string,
  primaryModel: string,
  fallbackModel = "gemini-3.1-flash-lite",
): Promise<{
  subjectName: string;
  officialUrl: string;
  fallbackUrl?: string;
  brandSummary: string;
} | null> {
  const discoveryPrompt = `You are a web research helper. The user asked a map poster theme designer:
"${userMessage}"

Does this request refer to a specific real-world race, marathon, event, trail organization, sports team, national/state park, university, festival, company, or brand that has an official website?
- If YES: find its OFFICIAL homepage URL (for example, https://www.lamarathon.com/ for Los Angeles Marathon, https://www.baa.org/ for Boston Marathon, https://www.chicagomarathon.com/ for Chicago Marathon). Do NOT return Wikipedia, social media, or news articles unless no official site exists.
- If NO (for example, it is purely an abstract mood like "cozy autumn cabin", "cyberpunk neon", or a generic color tweak like "make the roads darker"): return hasOfficialSubject: false.

Respond ONLY with a valid JSON object (no markdown fences, no extra prose):
{
  "hasOfficialSubject": true,
  "subjectName": "Official name of the race/event/brand",
  "officialUrl": "https://official-homepage.example/",
  "searchQuery": "Official name official website",
  "brandSummary": "1 short sentence describing the official site/logo colors"
}`;

  // Strategy 1: Gemini with Google Search Grounding (primary model, then fallback model)
  const searchModels = [primaryModel, fallbackModel].filter(
    (model, idx, arr) => Boolean(model) && arr.indexOf(model) === idx,
  );

  for (const model of searchModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: discoveryPrompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const rawText = String(response.text ?? "");
      const parsed = extractJsonSnippet(rawText);
      const chunks =
        (response.candidates?.[0]?.groundingMetadata?.groundingChunks as
          | Array<{ web?: { uri?: string; title?: string } }>
          | undefined) ?? [];

      if (parsed && parsed.hasOfficialSubject === false) {
        return null;
      }

      const subjectName = String(parsed?.subjectName ?? "").trim();
      const brandSummary = String(parsed?.brandSummary ?? "").trim();
      let officialUrl =
        normalizeUrlInput(String(parsed?.officialUrl ?? "")) ?? "";

      if (!officialUrl || !isNonAggregatorPublicUrl(officialUrl)) {
        const fromText = extractExplicitUrl(rawText);
        if (fromText && isNonAggregatorPublicUrl(fromText)) {
          officialUrl = fromText;
        }
      }

      if (!officialUrl || !isNonAggregatorPublicUrl(officialUrl)) {
        const fromChunks = await extractUrlFromGroundingChunks(chunks);
        if (fromChunks) {
          officialUrl = fromChunks;
        }
      }

      if (officialUrl && isSafePublicUrl(officialUrl)) {
        return {
          subjectName: subjectName || userMessage.trim(),
          officialUrl,
          brandSummary,
        };
      }
    } catch (error) {
      const status = (error as { status?: unknown })?.status;
      console.warn(
        `[brand-research] Search grounding discovery (${model}) skipped:`,
        status ?? (error instanceof Error ? error.message : error),
      );
    }
  }

  // Strategy 2: Structured Gemini classification + live DuckDuckGo web search
  for (const model of searchModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: discoveryPrompt,
        config: {
          responseMimeType: "application/json",
          ...(model === primaryModel
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : {}),
        },
      });

      const parsed = extractJsonSnippet(String(response.text ?? ""));
      if (!parsed || !parseTruthyFlag(parsed.hasOfficialSubject)) {
        return null;
      }

      const subjectName = String(parsed.subjectName ?? "").trim() || userMessage.trim();
      const brandSummary = String(parsed.brandSummary ?? "").trim();
      const searchQuery =
        String(parsed.searchQuery ?? "").trim() || `${subjectName} official website`;
      const candidateUrl = normalizeUrlInput(String(parsed.officialUrl ?? ""));
      const validCandidate =
        candidateUrl && isNonAggregatorPublicUrl(candidateUrl) ? candidateUrl : null;

      // Run live DuckDuckGo web search to verify/find the official homepage
      const ddgUrl = await searchDuckDuckGoOfficialUrl(searchQuery);
      const primaryUrl = ddgUrl ?? validCandidate;
      const fallbackUrl =
        ddgUrl && validCandidate && ddgUrl !== validCandidate
          ? validCandidate
          : undefined;

      if (primaryUrl && isSafePublicUrl(primaryUrl)) {
        return {
          subjectName,
          officialUrl: primaryUrl,
          fallbackUrl,
          brandSummary,
        };
      }
      return null;
    } catch (error) {
      const status = (error as { status?: unknown })?.status;
      console.warn(
        `[brand-research] Fallback official URL discovery (${model}) skipped:`,
        status ?? (error instanceof Error ? error.message : error),
      );
    }
  }

  return null;
}

export function shouldRunBrandResearch(
  latestUserMessage: string,
  selectedThemeIsGenerated: boolean,
  explicitUrlOverride?: string | null,
): boolean {
  if (explicitUrlOverride && normalizeUrlInput(explicitUrlOverride)) {
    return true;
  }
  if (extractExplicitUrl(latestUserMessage)) return true;

  const trimmed = latestUserMessage.trim();
  if (!trimmed) return false;

  // If the user is purely asking for a route overlay without asking for themes, skip brand color scraping.
  const onlyRouteRequest =
    /\b(add|overlay|plot|load)\b.*\b(route|course|gpx|track)\b/i.test(trimmed) &&
    !/\b(theme|color|colour|palette|style|design|look)\b/i.test(trimmed);
  if (onlyRouteRequest) return false;

  // Pure tweaks on an existing generated theme don't need fresh brand scraping unless a new subject is named.
  const looksLikePureColorTweak =
    /\b(darker|lighter|brighter|subtle|subtler|warmer|cooler|softer|bolder|muted|vibrant|contrast|roads?|streets?|water|parks?|land|buildings?|background|text|font|outline|rail|paths?|swap|invert|tweak|adjust|less|more)\b/i.test(
      trimmed,
    ) &&
    trimmed.length <= 120 &&
    !/\b(marathon|race|half|5k|10k|triathlon|ironman|ultra|trail|park|national|team|fc|united|club|university|college|festival|official|brand|logo|website|site)\b/i.test(
      trimmed,
    );

  if (selectedThemeIsGenerated && looksLikePureColorTweak) {
    return false;
  }

  return !looksLikePureColorTweak;
}

function buildFallbackSourceResult(
  url: string,
  name: string,
  brandSummary: string,
): BrandResearchResult {
  let domain = url;
  try {
    domain = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // ignore
  }
  return {
    source: {
      name: name || domain,
      url,
      domain,
      logoColors: [],
      siteColors: [],
    },
    pageTitle: name || domain,
    brandSummary,
    cssBrandVars: [],
  };
}

export async function researchOfficialBrand(
  ai: GoogleGenAI,
  latestUserMessage: string,
  primaryModel: string,
  options?: {
    fallbackModel?: string;
    explicitUrlOverride?: string | null;
  },
): Promise<BrandResearchResult | null> {
  const explicitUrl =
    (options?.explicitUrlOverride
      ? normalizeUrlInput(options.explicitUrlOverride)
      : null) ?? extractExplicitUrl(latestUserMessage);

  if (explicitUrl) {
    const inspected = await inspectWebsiteBranding(
      explicitUrl,
      "",
      "Directly inspected the official website URL provided by the user.",
    );
    if (inspected) {
      return inspected;
    }
    return buildFallbackSourceResult(
      explicitUrl,
      "",
      "User provided this official website URL (direct fetch was blocked; inspect via URL Context / Search).",
    );
  }

  const discovered = await discoverOfficialWebsite(
    ai,
    latestUserMessage,
    primaryModel,
    options?.fallbackModel,
  );
  if (!discovered) return null;

  const inspected = await inspectWebsiteBranding(
    discovered.officialUrl,
    discovered.subjectName,
    discovered.brandSummary,
  );
  if (inspected) {
    return inspected;
  }

  if (discovered.fallbackUrl) {
    const fallbackInspected = await inspectWebsiteBranding(
      discovered.fallbackUrl,
      discovered.subjectName,
      discovered.brandSummary,
    );
    if (fallbackInspected) {
      return fallbackInspected;
    }
  }

  // Fallback: even if the website blocked server fetch, return the discovered official URL metadata.
  return buildFallbackSourceResult(
    discovered.officialUrl,
    discovered.subjectName,
    discovered.brandSummary,
  );
}
