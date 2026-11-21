import { useCallback, useRef } from "react";
import { usePosterContext } from "@/features/poster/ui/PosterContext";
import { gpxParser, reverseGeocodeCoordinates } from "@/core/services";
import {
  formatLocationLabel,
  resolveDisplaySubtitle,
} from "@/features/location/domain/displaySubtitle";
import { MAX_GPX_FILE_SIZE_BYTES } from "@/features/routes/domain/constants";
import type {
  ParsedGpx,
  Route,
  RouteBounds,
} from "@/features/routes/domain/types";
import { getBundledGpxXml } from "@/features/routes/infrastructure/gpxLibrary";
import {
  boundsCenter,
  boundsHalfWidthMeters,
  combinedRoutesBounds,
  createRoute,
  getGpxUploadLabel,
  readFileAsText,
  routeBounds,
} from "@/features/routes/infrastructure/helpers";

const MAX_COMBINED_HALF_WIDTH_METERS = 500_000;

export type UploadGpxResult =
  | { status: "added" }
  | {
      status: "needs-confirmation";
      pendingRoute: Route;
      newBounds: RouteBounds;
      combinedHalfWidthMeters: number;
      replaceOnly?: boolean;
    };

interface UseGpxUploadResult {
  uploadGpxFile: (file: File) => Promise<UploadGpxResult>;
  addBundledGpxFile: (filename: string) => UploadGpxResult;
  confirmAddRoute: (pendingRoute: Route, newBounds: RouteBounds) => void;
  confirmReplaceRoutes: (pendingRoute: Route, newBounds: RouteBounds) => void;
}

function isGpxFile(file: File): boolean {
  if (file.name.toLowerCase().endsWith(".gpx")) return true;
  if (file.type === "application/gpx+xml") return true;
  return false;
}

export function useGpxUpload(): UseGpxUploadResult {
  const { state, dispatch } = usePosterContext();
  const { routes, routeDefaults, form } = state;
  const latestGeocodeSeqRef = useRef(0);

  const fitBoundsToForm = useCallback(
    (bounds: RouteBounds) => {
      const center = boundsCenter(bounds);
      const halfWidth = boundsHalfWidthMeters(bounds);
      if (!Number.isFinite(halfWidth) || halfWidth <= 0) return;

      dispatch({
        type: "SET_FORM_FIELDS",
        resetDisplayNameOverrides: true,
        clearSelectedLocation: true,
        fields: {
          latitude: center.lat.toFixed(6),
          longitude: center.lon.toFixed(6),
          distance: String(Math.round(halfWidth)),
        },
      });

      const lookupSeq = ++latestGeocodeSeqRef.current;
      void reverseGeocodeCoordinates(center.lat, center.lon)
        .then((nearest) => {
          if (lookupSeq !== latestGeocodeSeqRef.current) {
            return;
          }
          const fallbackLabel = String(nearest.label ?? "").trim();
          const nextCity = String(nearest.city ?? "").trim();
          const nextSubtitle = resolveDisplaySubtitle(nearest);
          const nextContinent = String(nearest.continent ?? "").trim();
          const nextLocation = formatLocationLabel(
            nextCity,
            nextSubtitle,
            fallbackLabel,
          );
          if (!nextLocation) {
            return;
          }
          dispatch({
            type: "SET_FORM_FIELDS",
            resetDisplayNameOverrides: true,
            fields: {
              location: nextLocation,
              displayCity: nextCity,
              displayCountry: nextSubtitle,
              displayContinent: nextContinent,
            },
          });
        })
        .catch(() => {
          // Ignore lookup failures; coordinates stay authoritative.
        });
    },
    [dispatch],
  );

  const addParsedGpxRoute = useCallback(
    (parsed: ParsedGpx, sourceFilename: string): UploadGpxResult => {
      const pendingRoute = createRoute({
        parsed,
        defaults: routeDefaults,
        source: "gpx",
        label: getGpxUploadLabel(sourceFilename),
        sourceFilename,
      });

      if (routes.length === 0) {
        dispatch({ type: "ADD_ROUTE", route: pendingRoute });
        fitBoundsToForm(parsed.bounds);
        return { status: "added" };
      }

      const combined = combinedRoutesBounds(routes, parsed.bounds);
      if (!combined) {
        dispatch({ type: "ADD_ROUTE", route: pendingRoute });
        return { status: "added" };
      }

      const combinedHalfWidth = boundsHalfWidthMeters(combined);
      if (combinedHalfWidth > MAX_COMBINED_HALF_WIDTH_METERS) {
        return {
          status: "needs-confirmation",
          pendingRoute,
          newBounds: parsed.bounds,
          combinedHalfWidthMeters: combinedHalfWidth,
          replaceOnly: true,
        };
      }

      const currentDistance = Number(form.distance) || 0;
      const firstBounds = routeBounds(routes[0]!);
      const firstHalfWidth = firstBounds ? boundsHalfWidthMeters(firstBounds) : 0;
      const threshold = Math.max(currentDistance * 2, firstHalfWidth * 2);

      if (threshold > 0 && combinedHalfWidth > threshold) {
        return {
          status: "needs-confirmation",
          pendingRoute,
          newBounds: parsed.bounds,
          combinedHalfWidthMeters: combinedHalfWidth,
        };
      }

      dispatch({ type: "ADD_ROUTE", route: pendingRoute });
      fitBoundsToForm(combined);
      return { status: "added" };
    },
    [dispatch, fitBoundsToForm, form.distance, routeDefaults, routes],
  );

  const uploadGpxFile = useCallback(
    async (file: File): Promise<UploadGpxResult> => {
      if (!isGpxFile(file)) {
        throw new Error("Please upload a .gpx file.");
      }
      if (file.size > MAX_GPX_FILE_SIZE_BYTES) {
        throw new Error("GPX file is too large (max 10 MB).");
      }

      const text = await readFileAsText(file);
      const parsed = gpxParser.parse(text, getGpxUploadLabel(file.name));
      return addParsedGpxRoute(parsed, file.name);
    },
    [addParsedGpxRoute],
  );

  const addBundledGpxFile = useCallback(
    (filename: string): UploadGpxResult => {
      const xml = getBundledGpxXml(filename);
      if (!xml) {
        throw new Error(`Could not find "${filename}" in src/data/gpx/.`);
      }
      const parsed = gpxParser.parse(xml, getGpxUploadLabel(filename));
      return addParsedGpxRoute(parsed, filename);
    },
    [addParsedGpxRoute],
  );

  const confirmAddRoute = useCallback(
    (pendingRoute: Route, newBounds: RouteBounds) => {
      dispatch({ type: "ADD_ROUTE", route: pendingRoute });
      const combined = combinedRoutesBounds(routes, newBounds);
      if (combined) fitBoundsToForm(combined);
    },
    [dispatch, fitBoundsToForm, routes],
  );

  const confirmReplaceRoutes = useCallback(
    (pendingRoute: Route, newBounds: RouteBounds) => {
      dispatch({ type: "REPLACE_ROUTES", routes: [pendingRoute] });
      fitBoundsToForm(newBounds);
    },
    [dispatch, fitBoundsToForm],
  );

  return {
    uploadGpxFile,
    addBundledGpxFile,
    confirmAddRoute,
    confirmReplaceRoutes,
  };
}
