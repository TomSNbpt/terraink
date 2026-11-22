import express from "express";
import type { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI, Type } from "@google/genai";
import {
  resolveRouteRequest,
  type ResolvedRouteOverlay,
  type RouteRequestPayload,
} from "./server/routeResolver.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || process.env.APP_PORT || 3000);
const IS_PROD = process.env.NODE_ENV === "production";
const GEMINI_MODEL = "gemini-4-hydrogen";

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
1. LIVE WEB RESEARCH: Always use Google Search when the user mentions a real event, race, trail, park, team, city flag, or brand so you discover its authentic official colors, logos, AND/OR official course map / turn-by-turn route. Summarize your findings concisely in plain text inside "reply" — do NOT include raw URLs, markdown link lists, or citation brackets in "reply".
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
5. CLARIFYING QUESTIONS VS GENERATING 3 THEMES:
   - If the user's request is genuinely vague or open-ended (e.g. just "make me a cool running theme" with no subject/mood and no route requested), you may ask 1–2 brief, specific clarifying questions and return "themes": [] and "routeRequest": null.
   - If the user gives a clear theme subject (e.g. "Chicago Marathon", "Vermont Long Trail", "Tokyo Night Run", "vintage coastal Maine") OR answers your clarifying questions, generate EXACTLY 3 distinct, genuinely different theme variations in "themes".
   - If the user has an active "selectedTheme" and asks for color adjustments/tweaks (e.g. "make the roads more subtle", "try lighter water", "warmer land color", "more contrast on the route"), ALWAYS generate EXACTLY 3 distinct new variations riffing on that selected theme and set "routeRequest": null (unless they also asked for a route).
6. OUTPUT FORMAT:
   - Always respond ONLY with valid JSON matching the requested schema.
   - All 16 color values must be valid 6-digit uppercase hex codes (#RRGGBB).
   - Theme names should be concise (2–4 words, e.g. "Lakefront Navy", "Grant Park Cream", "Windy City Slate").
   - Descriptions should be 1 crisp sentence explaining the palette and print mood.`;

const THEME_DESIGNER_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reply: {
      type: Type.STRING,
      description:
        "Concise plain-text summary of your color/course research, design rationale, or 1-2 clarifying questions. No URLs or citation markers.",
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
  if (status === 429 || /RESOURCE_EXHAUSTED/i.test(rawMessage)) {
    return {
      status: 429,
      message:
        "Gemini rate limit or quota reached. Please wait a moment and try again, or verify your API key tier in Settings > Secrets.",
    };
  }
  return {
    status: status >= 400 && status < 600 ? status : 500,
    message: rawMessage,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

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
      .slice(-20);

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

    const contents = messages.map((msg, index) => {
      const isLastUser = index === messages.length - 1 && msg.role === "user";
      let text = msg.content.trim();
      if (isLastUser && selectedTheme) {
        text +=
          `\n\n[Active Selected Generated Theme for Iteration]\n` +
          `Name: ${selectedTheme.name}\n` +
          `Description: ${selectedTheme.description ?? ""}\n` +
          `Colors JSON: ${JSON.stringify(selectedTheme.colors)}\n` +
          `Remember: if the user is asking to adjust or refine this selected theme, generate exactly 3 distinct CMYK-safe variations based on it.`;
      }
      return {
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text }],
      };
    });

    try {
      const response = await callGeminiWithRetry(() =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents,
          config: {
            systemInstruction: THEME_DESIGNER_SYSTEM_INSTRUCTION,
            tools: [{ googleSearch: {} }],
            responseMimeType: "application/json",
            responseSchema: THEME_DESIGNER_RESPONSE_SCHEMA,
          },
        }),
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
      const rawThemes = Array.isArray(parsed.themes) ? parsed.themes : [];
      const themes = rawThemes
        .slice(0, 3)
        .map((item, idx) => sanitizeThemeProposal(item, idx))
        .filter((item): item is GeneratedThemeProposal => item !== null);

      let routeOverlay: ResolvedRouteOverlay | null = null;
      const routeRequest = sanitizeRouteRequest(parsed.routeRequest);
      if (routeRequest) {
        routeOverlay = await resolveRouteRequest(routeRequest);
        if (!routeOverlay) {
          reply +=
            " (I couldn't resolve street/trail coordinates for that route automatically — you can also upload an official .gpx file in the Routes panel.)";
        }
      }

      res.json({ reply, themes, routeOverlay });
    } catch (error) {
      const formatted = formatApiError(error);
      console.error("[theme-designer] Gemini API error:", error);
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
