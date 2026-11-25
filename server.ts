import express from "express";
import type { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import {
  resolveRouteRequest,
  type ResolvedRouteOverlay,
  type RouteRequestPayload,
} from "./server/routeResolver.ts";
import {
  researchOfficialBrand,
  shouldRunBrandResearch,
  type BrandResearchResult,
} from "./server/brandResearch.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || process.env.APP_PORT || 3000);
const IS_PROD = process.env.NODE_ENV === "production";
const PRIMARY_GEMINI_MODEL = "gemini-4-hydrogen";
const FALLBACK_GEMINI_MODEL = "gemini-3.1-flash-lite";

const HEX6_PATTERN = /^#[0-9A-Fa-f]{6}$/;

interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

interface ThemeColorsPayload {
  ui: {
    bg: string;
    text: string;
  };
  map: {
    land: string;
    landcover: string;
    water: string;
    waterway: string;
    parks: string;
    buildings: string;
    aeroway: string;
    rail: string;
    roads: {
      major: string;
      minor_high: string;
      minor_mid: string;
      minor_low: string;
      path: string;
      outline: string;
    };
  };
}

interface SelectedThemeContext {
  name: string;
  description?: string;
  colors: ThemeColorsPayload;
}

interface GeneratedThemeProposal {
  name: string;
  description: string;
  colors: ThemeColorsPayload;
}

const THEME_DESIGNER_SYSTEM_INSTRUCTION = `You are Terraink's AI Cartographic Theme & Route Designer.
Your job is to help users:
(A) Design print-ready map poster color themes inspired by races, marathons, trails, cities, parks, events, or moods (e.g. "Chicago Marathon", "Vermont Long Trail", "Boston Marathon", "Appalachian Autumn"), AND
(B) Research and add official race courses, marathons, bike routes, or hiking trails as GPX-style route overlays on the map when requested (e.g. "add an overlay for the Chicago Marathon", "plot the Vermont Long Trail", or "Chicago Marathon theme and route overlay").

HARD REQUIREMENTS:
1. OFFICIAL WEBSITE & LOGO COLORS FIRST (NO GENERIC CITY CLICHÉS):
   - Whenever "[Official Brand Research]" is provided (and/or an official logo image is attached), those verified colors extracted from the official logo and official website are your PRIMARY source of truth.
   - NEVER substitute generic location/city stereotypes (e.g. generic sunset pink/palm trees for Los Angeles, or generic clichéd colors) when real official logo/website colors are provided or visible in the attached logo image.
   - If no [Official Brand Research] block was attached but the user names a real event, race, trail, park, team, or brand, use Google Search (and URL Context if a URL is given) to discover its authentic official logo and website colors.
   - Summarize the official logo/website colors you used concisely in plain text inside "reply" — do NOT paste raw URLs, markdown link lists, or citation brackets in "reply" (the UI displays the clickable source link separately).
2. CMYK / PRINTFUL MATTE PAPER SAFETY (MANDATORY): Every single hex color you produce MUST be CMYK-safe for printing on uncoated matte paper (Printful giclée / SWOP-GRACoL matte workflow):
   - Avoid out-of-gamut neon RGB colors (electric cyan #00FFFF, pure neon green #00FF00, pure magenta #FF00FF, ultra-saturated violet/royal blues with high magenta that shift purple on matte stock).
   - Keep deep blues slightly shifted toward clean cobalt/navy rather than violet-blue so they stay true blue on matte paper.
   - Keep bright accent teals/greens/oranges rich and vibrant yet pulled cleanly inside CMYK gamut (e.g. emerald-teal #26B89D instead of #00FFCC, vivid marathon red #C9332B instead of #FF0000).
   - Avoid crushing dark layers to pure #000000 (use deep ink tones like #101A28–#1A2636) and avoid harsh pure #FFFFFF glare where a soft matte paper white (#F4F6F8–#F7F5F0) prints cleaner.
3. CARTOGRAPHIC HIERARCHY & LEGIBILITY:
   - "ui.bg" should match "map.land" (used for poster edge fade/overlay).
   - "ui.text" is used for BOTH the poster title typography AND the default GPX route track color! Make sure "ui.text" has strong, unmistakable contrast against "map.land" and "map.water", and stands out clearly over the road network.
   - Roads must have a smooth, intentional visual hierarchy from most prominent to subtlest:
     roads.major > roads.minor_high > roads.minor_mid > roads.minor_low > roads.path.
   - Unless the user asks for bold high-contrast streets, keep minor_low and path restrained so dense city grids never overwhelm the GPX track or poster typography.
   - roads.outline normally matches map.land (for clean overpass/bridge casing) or a subtle neighbor tone.
   - Supporting polygons (landcover, parks, buildings, aeroway) should stay harmonious and subordinate to roads and water.
   - Water and waterway should normally match each other and read clearly against land.
4. ROUTE / GPX OVERLAY RESEARCH (WHEN USER ASKS FOR A COURSE, ROUTE, TRACK, OR OVERLAY):
   - Whenever the user asks to add, overlay, plot, map, or include a race course, marathon, half marathon, trail, or route (e.g. "add an overlay for the Chicago Marathon", "show the Boston Marathon course", "add the Vermont Long Trail track"), research the official current course via Google Search and populate "routeRequest":
     * "label": Concise official route title (e.g. "Chicago Marathon", "Vermont Long Trail").
     * "activityType": "road" for city races/marathons/road routes, or "trail" for hiking/backcountry/mountain trails.
     * "publicGpxOrGeoJsonUrl": ONLY include if Google Search turned up an actual direct raw .gpx or .geojson download URL (not an HTML page). Leave as "" if unsure.
     * "osmRelationSearch": Exact OpenStreetMap route relation name if the trail/course is well-known on OSM (e.g. "Long Trail", "Appalachian Trail", "Chicago Marathon"), or "" if not applicable.
     * "bbox": Tight bounding box { south, west, north, east } covering the full course.
     * "waypoints": 16 to 30 ordered, real-world { lat, lon, name } coordinates tracing the official course accurately from start to finish — include key intersections, neighborhoods, out-and-back turnarounds, bridges, and finish line so our street/path router snaps the track faithfully along the true course!
   - If the user asks ONLY to add a route/course overlay (and did NOT ask for new themes or color edits), return "themes": [] and populate "routeRequest".
   - If the user asks for BOTH a new theme AND a course overlay, return 3 themes AND populate "routeRequest".
   - If the user did NOT ask for a route/course overlay, set "routeRequest": null.
5. CLARIFYING QUESTIONS VS GENERATING 3 THEMES & REFINING THE SELECTED THEME:
   - Whenever "[Active Selected Theme]" is provided and the user asks for ANY change, adjustment, or tweak (e.g. "make the roads darker", "try lighter water", "more subtle streets", "warmer land", "brighter text/route", "less contrast"), NEVER ask clarifying questions and NEVER ask which theme they mean — ALWAYS assume they are referencing "[Active Selected Theme]".
   - For refinements of "[Active Selected Theme]":
     * Set "isRefinement": true.
     * Start from the exact hex palette of "[Active Selected Theme]" and keep unmodified layers faithful to it.
     * Generate EXACTLY 3 distinct CMYK-safe variations offering meaningful degrees/takes of the requested change (e.g. subtle / medium / bold).
     * Use the exact incremental names supplied in "[Active Selected Theme]" (e.g. "Bayou City Navy - 1", "Bayou City Navy - 2", "Bayou City Navy - 3").
     * Set "routeRequest": null unless they also explicitly requested a route overlay.
   - When creating themes for an official race, event, team, park, or brand (especially when "[Official Brand Research]" is provided):
     * Set "isRefinement": false and generate EXACTLY 3 distinct CMYK-safe options using a 2-strict + 1-looser mix:
       - Option 1 (Strict Official Brand — Light/Editorial): Strictly faithful to the official logo & website colors on a clean light/paper or soft-tinted land base with official brand colors driving water, roads, and typography.
       - Option 2 (Strict Official Brand — Bold/Dark Field): Strictly faithful to the official logo & website colors using the primary dark or signature brand hue as the land field and official secondary/accent hues for water, roads, and typography.
       - Option 3 (Creative Brand Spin): A looser, cartographically fresh creative take still clearly anchored in the official brand's signature hues (e.g., an unexpected tonal balance or elevated vintage/editorial twist on the official colors).
     * Mention briefly in each theme's description whether it is a strict official brand palette or the creative spin.
   - When the user introduces a purely abstract mood/style (no real-world brand/event):
     * Set "isRefinement": false and generate EXACTLY 3 distinct, genuinely different CMYK-safe theme variations with creative 2-4 word names.
   - Only ask 1–2 brief clarifying questions (with "themes": [] and "isRefinement": false) when there is NO clear subject and NO clear tweak request (e.g. just "make me a cool theme").
6. OUTPUT FORMAT:
   - Always respond ONLY with valid JSON matching the requested schema.
   - All 16 color values must be valid 6-digit uppercase hex codes (#RRGGBB).
   - Theme names should be concise (2–4 words, or the exact incremented names when refining).
   - Descriptions should be 1 crisp sentence explaining the palette and what changed.`;

const THEME_DESIGNER_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reply: {
      type: Type.STRING,
      description:
        "Concise plain-text summary of your color/course research, design rationale, or 1-2 clarifying questions. No URLs or citation markers.",
    },
    isRefinement: {
      type: Type.BOOLEAN,
      description:
        "True if the generated themes are refinements/tweaks of the Active Selected Theme; false if creating themes for a brand-new subject or only answering/routing.",
    },
    themes: {
      type: Type.ARRAY,
      description:
        "Either empty [] (when asking clarifying questions or when only adding a route overlay), or exactly 3 distinct CMYK-safe map theme options.",
      items: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            description: "Concise 2-4 word theme name.",
          },
          description: {
            type: Type.STRING,
            description: "One-sentence description of the palette and vibe.",
          },
          ui: {
            type: Type.OBJECT,
            properties: {
              bg: { type: Type.STRING, description: "6-digit hex #RRGGBB matching map.land" },
              text: { type: Type.STRING, description: "6-digit hex #RRGGBB for poster text & GPX tracks" },
            },
            required: ["bg", "text"],
          },
          map: {
            type: Type.OBJECT,
            properties: {
              land: { type: Type.STRING, description: "6-digit hex #RRGGBB" },
              landcover: { type: Type.STRING, description: "6-digit hex #RRGGBB" },
              water: { type: Type.STRING, description: "6-digit hex #RRGGBB" },
              waterway: { type: Type.STRING, description: "6-digit hex #RRGGBB" },
              parks: { type: Type.STRING, description: "6-digit hex #RRGGBB" },
              buildings: { type: Type.STRING, description: "6-digit hex #RRGGBB" },
              aeroway: { type: Type.STRING, description: "6-digit hex #RRGGBB" },
              rail: { type: Type.STRING, description: "6-digit hex #RRGGBB" },
              roads: {
                type: Type.OBJECT,
                properties: {
                  major: { type: Type.STRING, description: "6-digit hex #RRGGBB" },
                  minor_high: { type: Type.STRING, description: "6-digit hex #RRGGBB" },
                  minor_mid: { type: Type.STRING, description: "6-digit hex #RRGGBB" },
                  minor_low: { type: Type.STRING, description: "6-digit hex #RRGGBB" },
                  path: { type: Type.STRING, description: "6-digit hex #RRGGBB" },
                  outline: { type: Type.STRING, description: "6-digit hex #RRGGBB" },
                },
                required: [
                  "major",
                  "minor_high",
                  "minor_mid",
                  "minor_low",
                  "path",
                  "outline",
                ],
              },
            },
            required: [
              "land",
              "landcover",
              "water",
              "waterway",
              "parks",
              "buildings",
              "aeroway",
              "rail",
              "roads",
            ],
          },
        },
        required: ["name", "description", "ui", "map"],
      },
    },
    routeRequest: {
      type: Type.OBJECT,
      nullable: true,
      description:
        "Populated ONLY when the user asks to add/overlay/plot a race course, marathon, or trail route on the map. Otherwise null.",
      properties: {
        label: {
          type: Type.STRING,
          description: "Official display name of the race or trail route.",
        },
        activityType: {
          type: Type.STRING,
          description: "Either 'road' or 'trail'.",
        },
        publicGpxOrGeoJsonUrl: {
          type: Type.STRING,
          description:
            "Optional direct public HTTPS URL to a raw .gpx or .geojson file found via search, or empty string if none.",
        },
        osmRelationSearch: {
          type: Type.STRING,
          description:
            "Optional OpenStreetMap route relation name (best for trails or mapped courses), or empty string.",
        },
        bbox: {
          type: Type.OBJECT,
          nullable: true,
          properties: {
            south: { type: Type.NUMBER },
            west: { type: Type.NUMBER },
            north: { type: Type.NUMBER },
            east: { type: Type.NUMBER },
          },
          required: ["south", "west", "north", "east"],
        },
        waypoints: {
          type: Type.ARRAY,
          description:
            "16 to 30 ordered official course waypoints (lat, lon, optional name) from start to finish.",
          items: {
            type: Type.OBJECT,
            properties: {
              lat: { type: Type.NUMBER },
              lon: { type: Type.NUMBER },
              name: { type: Type.STRING },
            },
            required: ["lat", "lon"],
          },
        },
      },
      required: ["label", "activityType", "waypoints"],
    },
  },
  required: ["reply", "themes"],
};

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = String(process.env.GEMINI_API_KEY ?? "").trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function normalizeHex(value: unknown, fallback: string): string {
  const raw = String(value ?? "").trim();
  if (HEX6_PATTERN.test(raw)) return raw.toUpperCase();
  const shortMatch = raw.match(/^#([0-9A-Fa-f]{3})$/);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  const bareMatch = raw.match(/^([0-9A-Fa-f]{6})$/);
  if (bareMatch) return `#${bareMatch[1]}`.toUpperCase();
  return fallback;
}

function sanitizeThemeProposal(raw: unknown, index: number): GeneratedThemeProposal | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const uiRaw = (obj.ui && typeof obj.ui === "object" ? obj.ui : {}) as Record<string, unknown>;
  const mapRaw = (obj.map && typeof obj.map === "object" ? obj.map : {}) as Record<string, unknown>;
  const roadsRaw = (mapRaw.roads && typeof mapRaw.roads === "object"
    ? mapRaw.roads
    : {}) as Record<string, unknown>;

  const land = normalizeHex(mapRaw.land ?? uiRaw.bg, "#1A3A5C");
  const bg = normalizeHex(uiRaw.bg, land);
  const text = normalizeHex(uiRaw.text, "#E8EEF2");
  const water = normalizeHex(mapRaw.water, "#102840");
  const waterway = normalizeHex(mapRaw.waterway, water);
  const parks = normalizeHex(mapRaw.parks, land);
  const landcover = normalizeHex(mapRaw.landcover, land);
  const buildings = normalizeHex(mapRaw.buildings, parks);
  const aeroway = normalizeHex(mapRaw.aeroway, buildings);
  const major = normalizeHex(roadsRaw.major, text);
  const minorHigh = normalizeHex(roadsRaw.minor_high, major);
  const minorMid = normalizeHex(roadsRaw.minor_mid, minorHigh);
  const minorLow = normalizeHex(roadsRaw.minor_low, minorMid);
  const pathColor = normalizeHex(roadsRaw.path, minorLow);
  const outline = normalizeHex(roadsRaw.outline, land);
  const rail = normalizeHex(mapRaw.rail, minorMid);

  const name = String(obj.name ?? "").trim().slice(0, 80) || `Option ${index + 1}`;
  const description =
    String(obj.description ?? "").trim().slice(0, 240) ||
    "CMYK-safe custom map palette.";

  return {
    name,
    description,
    colors: {
      ui: { bg, text },
      map: {
        land,
        landcover,
        water,
        waterway,
        parks,
        buildings,
        aeroway,
        rail,
        roads: {
          major,
          minor_high: minorHigh,
          minor_mid: minorMid,
          minor_low: minorLow,
          path: pathColor,
          outline,
        },
      },
    },
  };
}

function sanitizeRouteRequest(raw: unknown): RouteRequestPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const label = String(obj.label ?? "").trim().slice(0, 80);
  if (!label) return null;

  const activityType = obj.activityType === "trail" ? "trail" : "road";
  const publicGpxOrGeoJsonUrl =
    typeof obj.publicGpxOrGeoJsonUrl === "string" &&
    obj.publicGpxOrGeoJsonUrl.trim().length > 0
      ? obj.publicGpxOrGeoJsonUrl.trim()
      : undefined;
  const osmRelationSearch =
    typeof obj.osmRelationSearch === "string" &&
    obj.osmRelationSearch.trim().length > 0
      ? obj.osmRelationSearch.trim()
      : undefined;

  let bbox: RouteRequestPayload["bbox"];
  if (obj.bbox && typeof obj.bbox === "object") {
    const b = obj.bbox as Record<string, unknown>;
    const south = Number(b.south);
    const west = Number(b.west);
    const north = Number(b.north);
    const east = Number(b.east);
    if (
      Number.isFinite(south) &&
      Number.isFinite(west) &&
      Number.isFinite(north) &&
      Number.isFinite(east)
    ) {
      bbox = { south, west, north, east };
    }
  }

  const waypoints = Array.isArray(obj.waypoints)
    ? obj.waypoints
        .filter((wp): wp is Record<string, unknown> => Boolean(wp) && typeof wp === "object")
        .map((wp) => ({
          lat: Number(wp.lat),
          lon: Number(wp.lon),
          ...(typeof wp.name === "string" && wp.name.trim()
            ? { name: wp.name.trim().slice(0, 80) }
            : {}),
        }))
        .filter((wp) => Number.isFinite(wp.lat) && Number.isFinite(wp.lon))
    : [];

  if (!publicGpxOrGeoJsonUrl && !osmRelationSearch && waypoints.length < 2) {
    return null;
  }

  return {
    label,
    activityType,
    publicGpxOrGeoJsonUrl,
    osmRelationSearch,
    bbox,
    waypoints,
  };
}

function extractJsonObject(rawText: string): Record<string, unknown> {
  const trimmed = rawText.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(unfenced) as Record<string, unknown>;
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(unfenced.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error("Model response did not contain valid JSON.");
  }
}

function computeNextIncrementedNames(
  selectedThemeName: string,
  existingNames: string[],
  count = 3,
): string[] {
  const baseName =
    selectedThemeName.replace(/\s*-\s*\d+$/, "").trim() ||
    selectedThemeName.trim() ||
    "Theme";
  const escapedBase = baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedBase}\\s*-\\s*(\\d+)$`, "i");

  let maxIndex = 0;
  for (const name of existingNames) {
    const match = String(name ?? "").trim().match(pattern);
    if (match) {
      const parsed = Number.parseInt(match[1], 10);
      if (Number.isFinite(parsed) && parsed > maxIndex) {
        maxIndex = parsed;
      }
    }
  }

  return Array.from({ length: count }, (_, idx) => `${baseName} - ${maxIndex + idx + 1}`);
}

function isQuotaError(error: unknown): boolean {
  const err = error as { status?: unknown; message?: unknown };
  const status = typeof err?.status === "number" ? err.status : 0;
  const rawMessage = String(err?.message ?? "");
  return status === 429 || /RESOURCE_EXHAUSTED|quota|rate[- ]?limit/i.test(rawMessage);
}

function shouldUseSearchGrounding(
  latestUserMessage: string,
  selectedThemeIsGenerated: boolean,
): boolean {
  const asksForLookup =
    /\b(route|course|overlay|gpx|track|trail|marathon|race|half|5k|10k|triathlon|ironman|ultra|official|research|search|look up|find|map of)\b/i.test(
      latestUserMessage,
    );
  if (asksForLookup) return true;
  if (selectedThemeIsGenerated) return false;
  // Pure color/layer tweaks against the currently displayed theme don't need web search.
  const looksLikePureColorTweak =
    /\b(darker|lighter|brighter|subtle|subtler|warmer|cooler|softer|bolder|muted|vibrant|contrast|roads?|streets?|water|parks?|land|buildings?|background|text|font|outline|rail|paths?)\b/i.test(
      latestUserMessage,
    ) && latestUserMessage.trim().length <= 120;
  return !looksLikePureColorTweak;
}

async function callGeminiWithRetry<T>(fn: () => Promise<T>, maxAttempts = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status =
        typeof (error as { status?: unknown })?.status === "number"
          ? (error as { status: number }).status
          : 0;
      const isRetryable = status === 500 || status === 503 || status === 504;
      if (!isRetryable || attempt === maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
    }
  }
  throw lastError;
}

type GeminiContentPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

async function generateDesignerContent(
  ai: GoogleGenAI,
  contents: Array<{ role: string; parts: GeminiContentPart[] }>,
  useSearchFirst: boolean,
  useUrlContext = false,
) {
  const strategies: Array<{
    model: string;
    useSearch: boolean;
    useUrlContext: boolean;
    thinkingLow: boolean;
  }> = useSearchFirst
    ? [
        {
          model: PRIMARY_GEMINI_MODEL,
          useSearch: true,
          useUrlContext,
          thinkingLow: true,
        },
        ...(useUrlContext
          ? [
              {
                model: PRIMARY_GEMINI_MODEL,
                useSearch: true,
                useUrlContext: false,
                thinkingLow: true,
              },
            ]
          : []),
        {
          model: PRIMARY_GEMINI_MODEL,
          useSearch: false,
          useUrlContext: false,
          thinkingLow: true,
        },
        {
          model: FALLBACK_GEMINI_MODEL,
          useSearch: true,
          useUrlContext: false,
          thinkingLow: false,
        },
        {
          model: FALLBACK_GEMINI_MODEL,
          useSearch: false,
          useUrlContext: false,
          thinkingLow: false,
        },
      ]
    : [
        {
          model: PRIMARY_GEMINI_MODEL,
          useSearch: false,
          useUrlContext: false,
          thinkingLow: true,
        },
        {
          model: FALLBACK_GEMINI_MODEL,
          useSearch: false,
          useUrlContext: false,
          thinkingLow: false,
        },
      ];

  let lastError: unknown;
  for (let i = 0; i < strategies.length; i += 1) {
    const strategy = strategies[i];
    const tools: Array<Record<string, Record<string, never>>> = [];
    if (strategy.useSearch) tools.push({ googleSearch: {} });
    if (strategy.useUrlContext) tools.push({ urlContext: {} });

    try {
      return await callGeminiWithRetry(() =>
        ai.models.generateContent({
          model: strategy.model,
          contents,
          config: {
            systemInstruction: THEME_DESIGNER_SYSTEM_INSTRUCTION,
            ...(tools.length > 0 ? { tools } : {}),
            ...(strategy.thinkingLow
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
            responseMimeType: "application/json",
            responseSchema: THEME_DESIGNER_RESPONSE_SCHEMA,
          },
        }),
      );
    } catch (error) {
      lastError = error;
      const err = error as { status?: unknown; message?: unknown };
      const status = typeof err?.status === "number" ? err.status : 0;
      const rawMessage = String(err?.message ?? "");
      const isAuthError =
        status === 403 || /API_KEY_INVALID|PERMISSION_DENIED/i.test(rawMessage);
      const canFallback =
        !isAuthError &&
        (isQuotaError(error) ||
          status === 404 ||
          ((strategy.useSearch || strategy.useUrlContext) && status === 400));

      if (!canFallback || i === strategies.length - 1) {
        throw error;
      }
      // Brief pause before falling back to an alternate grounding/model quota pool.
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  throw lastError;
}

function formatApiError(error: unknown): { status: number; message: string } {
  const err = error as { status?: number; message?: string };
  const status = typeof err?.status === "number" ? err.status : 500;
  const rawMessage = String(err?.message ?? "Unexpected AI error");

  if (status === 400 || status === 403 || /API_KEY_INVALID|PERMISSION_DENIED/i.test(rawMessage)) {
    return {
      status,
      message:
        "Gemini API key was rejected or is not configured. Check your API key in Settings > Secrets.",
    };
  }
  if (isQuotaError(error)) {
    return {
      status: 429,
      message:
        "Gemini API quota reached for your current key. Please wait a minute and try again, or select a billing-enabled API key in Settings > Secrets for higher limits.",
    };
  }
  return {
    status: status >= 400 && status < 600 ? status : 500,
    message: rawMessage,
  };
}

const OPENFREEMAP_PLANET_URL = "https://tiles.openfreemap.org/planet";
const OPENFREEMAP_PLANET_TTL_MS = 15 * 60 * 1000;
const OPENFREEMAP_TILE_VERSION_RE = /^[A-Za-z0-9._-]+$/;
const OPENFREEMAP_TILE_INT_RE = /^\d+$/;
const OPENFREEMAP_TILE_URL_RE =
  /^https:\/\/tiles\.openfreemap\.org\/planet\/([A-Za-z0-9._-]+)\/\{z\}\/\{x\}\/\{y\}\.pbf$/;

interface CachedPlanetTileJson {
  data: Record<string, unknown>;
  fetchedAt: number;
}

let cachedPlanetTileJson: CachedPlanetTileJson | null = null;
let inFlightPlanetTileJson: Promise<Record<string, unknown>> | null = null;

async function fetchUpstreamWithRetry(
  url: string,
  attempts = 3,
  timeoutMs = 10_000,
): Promise<globalThis.Response> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "*/*",
          "User-Agent": "Terraink/0.4 (+https://openfreemap.org)",
        },
      });
      clearTimeout(timer);
      if (response.status >= 500 && attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        continue;
      }
      return response;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
  }
  throw lastError ?? new Error(`Failed to fetch ${url}`);
}

async function loadPlanetTileJson(): Promise<Record<string, unknown>> {
  const now = Date.now();
  if (
    cachedPlanetTileJson &&
    now - cachedPlanetTileJson.fetchedAt < OPENFREEMAP_PLANET_TTL_MS
  ) {
    return cachedPlanetTileJson.data;
  }
  if (inFlightPlanetTileJson) {
    return inFlightPlanetTileJson;
  }

  inFlightPlanetTileJson = (async () => {
    try {
      const upstream = await fetchUpstreamWithRetry(OPENFREEMAP_PLANET_URL, 3, 10_000);
      if (!upstream.ok) {
        throw new Error(`OpenFreeMap TileJSON HTTP ${upstream.status}`);
      }
      const parsed = (await upstream.json()) as Record<string, unknown>;
      cachedPlanetTileJson = { data: parsed, fetchedAt: Date.now() };
      return parsed;
    } catch (error) {
      if (cachedPlanetTileJson) {
        return cachedPlanetTileJson.data;
      }
      throw error;
    } finally {
      inFlightPlanetTileJson = null;
    }
  })();

  return inFlightPlanetTileJson;
}

function parseHttpOrigin(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.origin;
    }
  } catch {
    return null;
  }
  return null;
}

function getRequestOrigin(req: Request): string {
  const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "")
    .split(",")[0]
    .trim();
  const forwardedHost = String(req.headers["x-forwarded-host"] ?? "")
    .split(",")[0]
    .trim();

  if (forwardedHost) {
    const isLocalForwarded =
      forwardedHost.startsWith("localhost") ||
      forwardedHost.startsWith("127.0.0.1") ||
      forwardedHost.startsWith("0.0.0.0");
    const proto = forwardedProto || (isLocalForwarded ? "http" : "https");
    return `${proto}://${forwardedHost}`;
  }

  const originHeader = parseHttpOrigin(
    typeof req.headers.origin === "string" ? req.headers.origin : undefined,
  );
  if (originHeader) {
    return originHeader;
  }

  const refererOrigin = parseHttpOrigin(
    typeof req.headers.referer === "string" ? req.headers.referer : undefined,
  );
  if (refererOrigin) {
    return refererOrigin;
  }

  const host = req.get("host") ?? `localhost:${PORT}`;
  const isLocal =
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("0.0.0.0");
  const proto = forwardedProto || (isLocal ? "http" : "https");
  return `${proto}://${host}`;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/openfreemap/planet", async (req: Request, res: Response) => {
    try {
      const tileJson = await loadPlanetTileJson();
      const origin = getRequestOrigin(req);
      const tiles = Array.isArray(tileJson.tiles)
        ? tileJson.tiles.map((entry) => {
            if (typeof entry !== "string") return entry;
            const match = OPENFREEMAP_TILE_URL_RE.exec(entry);
            if (!match) return entry;
            return `${origin}/api/openfreemap/tiles/${encodeURIComponent(match[1])}/{z}/{x}/{y}.pbf`;
          })
        : tileJson.tiles;

      res.setHeader("Cache-Control", "public, max-age=300");
      res.json({ ...tileJson, tiles });
    } catch (error) {
      console.warn("[openfreemap] Failed to load planet TileJSON:", error);
      res.status(502).json({ error: "Failed to load OpenFreeMap TileJSON" });
    }
  });

  app.get(
    "/api/openfreemap/tiles/:version/:z/:x/:yFile",
    async (req: Request, res: Response) => {
      const version = String(req.params.version ?? "");
      const z = String(req.params.z ?? "");
      const x = String(req.params.x ?? "");
      const yFile = String(req.params.yFile ?? "");
      const y = yFile.endsWith(".pbf") ? yFile.slice(0, -4) : "";

      const zNum = Number(z);
      if (
        !OPENFREEMAP_TILE_VERSION_RE.test(version) ||
        !OPENFREEMAP_TILE_INT_RE.test(z) ||
        !OPENFREEMAP_TILE_INT_RE.test(x) ||
        !OPENFREEMAP_TILE_INT_RE.test(y) ||
        zNum < 0 ||
        zNum > 22
      ) {
        res.status(400).send("Invalid tile coordinates");
        return;
      }

      const upstreamUrl = `${OPENFREEMAP_PLANET_URL}/${encodeURIComponent(version)}/${z}/${x}/${y}.pbf`;
      try {
        const upstream = await fetchUpstreamWithRetry(upstreamUrl, 2, 10_000);
        if (upstream.status === 204 || upstream.status === 404) {
          res.setHeader("Cache-Control", "public, max-age=86400, immutable");
          res.status(204).end();
          return;
        }
        if (!upstream.ok) {
          res.status(upstream.status).end();
          return;
        }
        const buffer = Buffer.from(await upstream.arrayBuffer());
        res.setHeader("Content-Type", "application/vnd.mapbox-vector-tile");
        res.setHeader("Cache-Control", "public, max-age=86400, immutable");
        res.status(200).send(buffer);
      } catch (error) {
        console.warn(`[openfreemap] Tile fetch failed (${z}/${x}/${y}):`, error);
        res.status(502).end();
      }
    },
  );

  app.post("/api/theme-designer/chat", async (req: Request, res: Response) => {
    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          "GEMINI_API_KEY is not configured on the server. Add your key in Settings > Secrets to use Theme Designer.",
      });
      return;
    }

    const body = req.body as {
      messages?: unknown;
      selectedTheme?: SelectedThemeContext | null;
      selectedThemeIsGenerated?: unknown;
      existingThemeNames?: unknown;
      officialUrl?: unknown;
    };

    const rawMessages = Array.isArray(body?.messages) ? body.messages : [];
    const messages: ChatHistoryMessage[] = rawMessages
      .filter(
        (entry): entry is ChatHistoryMessage =>
          Boolean(entry) &&
          typeof entry === "object" &&
          ((entry as ChatHistoryMessage).role === "user" ||
            (entry as ChatHistoryMessage).role === "assistant") &&
          typeof (entry as ChatHistoryMessage).content === "string" &&
          (entry as ChatHistoryMessage).content.trim().length > 0,
      )
      .slice(-10);

    if (messages.length === 0) {
      res.status(400).json({ error: "Please enter a theme request to get started." });
      return;
    }

    const selectedTheme =
      body?.selectedTheme &&
      typeof body.selectedTheme === "object" &&
      typeof body.selectedTheme.name === "string" &&
      body.selectedTheme.colors
        ? body.selectedTheme
        : null;

    const selectedThemeIsGenerated = body?.selectedThemeIsGenerated === true;
    const officialUrl =
      typeof body?.officialUrl === "string" ? body.officialUrl.trim() : "";
    const existingThemeNames = Array.isArray(body?.existingThemeNames)
      ? body.existingThemeNames
          .filter((name): name is string => typeof name === "string")
          .map((name) => name.trim())
          .filter(Boolean)
          .slice(0, 100)
      : [];

    const nextIncrementedNames = selectedTheme
      ? computeNextIncrementedNames(
          selectedTheme.name,
          [...existingThemeNames, selectedTheme.name],
          3,
        )
      : [];

    const lastUserMessage =
      [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

    let brandResearch: BrandResearchResult | null = null;
    if (shouldRunBrandResearch(lastUserMessage, selectedThemeIsGenerated, officialUrl)) {
      brandResearch = await researchOfficialBrand(
        ai,
        lastUserMessage,
        PRIMARY_GEMINI_MODEL,
        {
          fallbackModel: FALLBACK_GEMINI_MODEL,
          explicitUrlOverride: officialUrl || null,
        },
      );
    }

    const contents: Array<{ role: string; parts: GeminiContentPart[] }> =
      messages.map((msg, index) => {
        const isLastUser = index === messages.length - 1 && msg.role === "user";
        let text = msg.content.trim();
        const parts: GeminiContentPart[] = [];

        if (isLastUser && brandResearch) {
          const { source, pageTitle, brandSummary, cssBrandVars, logoImage } =
            brandResearch;
          const varSummary =
            cssBrandVars.length > 0
              ? cssBrandVars.map((v) => `${v.name}: ${v.hex}`).join(", ")
              : "none";
          text +=
            `\n\n[Official Brand Research — PRIMARY COLOR SOURCE]\n` +
            `Subject: ${source.name}\n` +
            `Official Website: ${source.url} (domain: ${source.domain})\n` +
            (pageTitle ? `Page Title: ${pageTitle}\n` : "") +
            (brandSummary ? `Brand Summary: ${brandSummary}\n` : "") +
            `Extracted Official Logo Colors: ${
              source.logoColors.length > 0
                ? source.logoColors.join(", ")
                : logoImage
                  ? "inspect the attached official logo image"
                  : "not directly extracted (check official website via URL Context / Search)"
            }\n` +
            `Extracted Official Website Brand Colors: ${
              source.siteColors.length > 0 ? source.siteColors.join(", ") : "none extracted"
            }\n` +
            `Extracted CSS Brand Variables: ${varSummary}\n` +
            `MANDATORY INSTRUCTIONS FOR THIS REQUEST:\n` +
            `- Set "isRefinement": false because this is an official brand theme request.\n` +
            `- Base your palettes directly on these verified official logo and website colors (and the attached official logo image if present). Do NOT invent generic city stereotypes.\n` +
            `- Produce 2 STRICT official-brand themes (Options 1 & 2, staying faithfully within these official colors with only minor CMYK-safe print adjustments) and 1 LOOSER creative take (Option 3, a fresh cartographic twist inspired by these official colors).\n` +
            `- In "reply", briefly note the official colors pulled from ${source.domain} and clearly distinguish the 2 strict options from the looser creative take (do not include raw URLs).`;

          if (logoImage) {
            parts.push({
              inlineData: {
                mimeType: logoImage.mimeType,
                data: logoImage.data,
              },
            });
          }
        }

        if (isLastUser && selectedTheme && !brandResearch) {
          text +=
            `\n\n[Active Selected Theme]\n` +
            `Name: ${selectedTheme.name}\n` +
            `Description: ${selectedTheme.description ?? ""}\n` +
            `Colors JSON: ${JSON.stringify(selectedTheme.colors)}\n` +
            `Incremental Variation Names (use these exact names in order if refining this theme): ${nextIncrementedNames.join(", ")}\n` +
            `Important: If the user is asking for a change or tweak (e.g. darker roads, lighter water, more contrast, warmer land), assume they mean this Active Selected Theme, set isRefinement=true, do NOT ask which theme they mean, and generate 3 distinct CMYK-safe variations using the exact incremental names above. If they are asking for a brand-new subject/event/trail instead, set isRefinement=false.`;
        }

        parts.push({ text });
        return {
          role: msg.role === "assistant" ? "model" : "user",
          parts,
        };
      });

    const asksForRoute =
      /\b(route|course|overlay|gpx|track|plot)\b/i.test(lastUserMessage) ||
      /\b(add|show|draw|load)\b.*\btrail\b/i.test(lastUserMessage);
    const hasScrapedBrandColors = Boolean(
      brandResearch &&
        (brandResearch.source.logoColors.length > 0 ||
          brandResearch.source.siteColors.length > 0 ||
          brandResearch.logoImage),
    );
    const useUrlContext = Boolean(brandResearch && !hasScrapedBrandColors);
    const useSearchFirst =
      asksForRoute ||
      (!hasScrapedBrandColors &&
        shouldUseSearchGrounding(lastUserMessage, selectedThemeIsGenerated));

    try {
      const response = await generateDesignerContent(
        ai,
        contents,
        useSearchFirst || useUrlContext,
        useUrlContext,
      );

      const rawText = String(response.text ?? "").trim();
      if (!rawText) {
        res.status(502).json({ error: "The AI returned an empty response. Please try again." });
        return;
      }

      const parsed = extractJsonObject(rawText);
      let reply =
        String(parsed.reply ?? "").trim() ||
        "Here are your map design results.";
      const isRefinement = brandResearch ? false : parsed.isRefinement === true;
      const rawThemes = Array.isArray(parsed.themes) ? parsed.themes : [];
      const themes = rawThemes
        .slice(0, 3)
        .map((item, idx) => sanitizeThemeProposal(item, idx))
        .filter((item): item is GeneratedThemeProposal => item !== null)
        .map((theme, idx) =>
          isRefinement && nextIncrementedNames[idx]
            ? { ...theme, name: nextIncrementedNames[idx] }
            : theme,
        );

      let routeOverlay: ResolvedRouteOverlay | null = null;
      const routeRequest = asksForRoute ? sanitizeRouteRequest(parsed.routeRequest) : null;
      if (routeRequest) {
        routeOverlay = await resolveRouteRequest(routeRequest);
        if (!routeOverlay) {
          reply +=
            " (I couldn't resolve street/trail coordinates for that route automatically — you can also upload an official .gpx file in the Routes panel.)";
        }
      }

      res.json({
        reply,
        themes,
        routeOverlay,
        brandSource: brandResearch ? brandResearch.source : null,
      });
    } catch (error) {
      const formatted = formatApiError(error);
      if (formatted.status === 429 || formatted.status === 403 || formatted.status === 400) {
        console.warn(`[theme-designer] Gemini API (${formatted.status}): ${formatted.message}`);
      } else {
        console.error("[theme-designer] Gemini API error:", error);
      }
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("/{*splat}", (_req: Request, res: Response) => {
      const indexPath = path.join(distDir, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Not found");
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[terraink] Server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
