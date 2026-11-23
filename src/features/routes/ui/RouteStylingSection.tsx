import { useCallback, useEffect, useMemo, useState } from "react";
import { usePosterContext } from "@/features/poster/ui/PosterContext";
import type { Route, RouteEndpointMarker } from "@/features/routes/domain/types";
import {
  MAX_MARKER_SIZE,
  MIN_MARKER_SIZE,
} from "@/features/markers/domain/constants";
import {
  resolveRouteOutline,
  resolveRouteOutline2,
  routeLengthMeters,
} from "@/features/routes/infrastructure/helpers";
import {
  DEFAULT_ROUTE_ENDPOINT_OUTLINE_ENABLED,
  DEFAULT_ROUTE_FINISH_COLOR,
  DEFAULT_ROUTE_OUTLINE_COLOR,
  DEFAULT_ROUTE_OUTLINE2_COLOR,
  DEFAULT_ROUTE_START_COLOR,
  MAX_ROUTE_OPACITY,
  MAX_ROUTE_OUTLINE_WIDTH,
  MAX_ROUTE_STROKE_WIDTH,
  MIN_ROUTE_OPACITY,
  MIN_ROUTE_OUTLINE_WIDTH,
  MIN_ROUTE_STROKE_WIDTH,
  ROUTE_LINE_STYLES,
} from "@/features/routes/domain/constants";
import ColorPicker from "@/features/theme/ui/ColorPicker";
import { buildDynamicColorChoices } from "@/features/theme/domain/colorSuggestions";
import {
  DISPLAY_PALETTE_KEYS,
  type ThemeColorKey,
} from "@/features/theme/domain/types";
import { getThemeColorByPath } from "@/features/theme/domain/colorPaths";
import { CheckIcon, CloseIcon, TrashIcon } from "@/shared/ui/Icons";
import MarkerVisual from "@/features/markers/ui/MarkerVisual";
import {
  findMarkerIcon,
  predefinedMarkerIcons,
} from "@/features/markers/infrastructure/iconRegistry";

type RouteEndpointKind = "start" | "finish";

interface EndpointPickerState {
  routeId: string;
  kind: RouteEndpointKind;
}

interface RouteColorPickerState {
  routeId: string;
  target: "route" | "outline" | "outline2";
}

function formatRouteDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return "—";
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(2)} km` : `${km.toFixed(1)} km`;
}

function swatchIconColor(hex: string): string {
  const clean = hex.trim().replace(/^#/, "");
  const full =
    clean.length === 3
      ? `${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return "#ffffff";
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.65 ? "#0f172a" : "#ffffff";
}

export default function RouteStylingSection() {
  const { state, dispatch, effectiveTheme } = usePosterContext();
  const { routes, customMarkerIcons } = state;

  const [openRouteId, setOpenRouteId] = useState<string | null>(null);
  const [collapsedSingleRouteId, setCollapsedSingleRouteId] = useState<
    string | null
  >(null);
  const [openColorPicker, setOpenColorPicker] =
    useState<RouteColorPickerState | null>(null);
  const [activeEndpoint, setActiveEndpoint] =
    useState<EndpointPickerState | null>(null);
  const [isEndpointIconOpen, setIsEndpointIconOpen] = useState(false);
  const [isEndpointColorOpen, setIsEndpointColorOpen] = useState(false);

  const singleRouteId = routes.length === 1 ? routes[0]!.id : null;

  // Reset manual collapse when the single loaded route changes or multiple routes exist
  useEffect(() => {
    setCollapsedSingleRouteId(null);
  }, [singleRouteId]);

  const palette = useMemo(
    () =>
      DISPLAY_PALETTE_KEYS.map((key) =>
        getThemeColorByPath(effectiveTheme, key as ThemeColorKey),
      ).filter(Boolean),
    [effectiveTheme],
  );

  const updateRoute = useCallback(
    (routeId: string, changes: Partial<Route>) => {
      dispatch({ type: "UPDATE_ROUTE", routeId, changes });
    },
    [dispatch],
  );

  const removeRoute = useCallback(
    (routeId: string) => {
      dispatch({ type: "REMOVE_ROUTE", routeId });
      setOpenRouteId((current) => (current === routeId ? null : current));
      setCollapsedSingleRouteId((current) =>
        current === routeId ? null : current,
      );
      setOpenColorPicker((current) =>
        current?.routeId === routeId ? null : current,
      );
      setActiveEndpoint((current) =>
        current?.routeId === routeId ? null : current,
      );
    },
    [dispatch],
  );

  const toggleCardOpen = useCallback(
    (routeId: string) => {
      if (singleRouteId === routeId) {
        setCollapsedSingleRouteId((current) =>
          current === routeId ? null : routeId,
        );
      } else {
        setOpenRouteId((current) => (current === routeId ? null : routeId));
      }
      setOpenColorPicker(null);
      setActiveEndpoint(null);
      setIsEndpointIconOpen(false);
      setIsEndpointColorOpen(false);
    },
    [singleRouteId],
  );

  const closeCard = useCallback(
    (routeId: string) => {
      if (singleRouteId === routeId) {
        setCollapsedSingleRouteId(routeId);
      } else {
        setOpenRouteId(null);
      }
      setOpenColorPicker(null);
      setActiveEndpoint(null);
      setIsEndpointIconOpen(false);
      setIsEndpointColorOpen(false);
    },
    [singleRouteId],
  );

  const openEndpointEditor = useCallback(
    (routeId: string, kind: RouteEndpointKind) => {
      setActiveEndpoint({ routeId, kind });
      setIsEndpointIconOpen(false);
      setIsEndpointColorOpen(false);
      setOpenColorPicker(null);
    },
    [],
  );

  const closeEndpointEditor = useCallback(() => {
    setActiveEndpoint(null);
    setIsEndpointIconOpen(false);
    setIsEndpointColorOpen(false);
  }, []);

  const updateEndpoint = useCallback(
    (
      routeId: string,
      kind: RouteEndpointKind,
      changes: Partial<RouteEndpointMarker>,
    ) => {
      const route = routes.find((r) => r.id === routeId);
      if (!route) return;
      const current = kind === "start" ? route.startMarker : route.finishMarker;
      const next: RouteEndpointMarker = { ...current, ...changes };
      dispatch({
        type: "UPDATE_ROUTE",
        routeId,
        changes:
          kind === "start"
            ? { startMarker: next }
            : { finishMarker: next },
      });
    },
    [dispatch, routes],
  );

  return (
    <div className="design-route-styling">
      <p className="section-summary-label">ROUTE STYLING</p>

      <div className="routes-section__content">
        {routes.length === 0 ? (
          <p className="routes-section__empty">
            Load a GPX track in <strong>Routes</strong> to style it here.
          </p>
        ) : null}

        {routes.map((route) => {
          const isSingle = singleRouteId === route.id;
          const isOpen = isSingle
            ? collapsedSingleRouteId !== route.id
            : openRouteId === route.id;
          const isColorOpen =
            openColorPicker?.routeId === route.id &&
            openColorPicker.target === "route";
          const isOutlineColorOpen =
            openColorPicker?.routeId === route.id &&
            openColorPicker.target === "outline";
          const isOutline2ColorOpen =
            openColorPicker?.routeId === route.id &&
            openColorPicker.target === "outline2";
          const outline = resolveRouteOutline(route);
          const outline2 = resolveRouteOutline2(route);
          const colorChoices = buildDynamicColorChoices(route.color, palette);
          const outlineColorChoices = buildDynamicColorChoices(
            outline.color,
            palette,
          );
          const outline2ColorChoices = buildDynamicColorChoices(
            outline2.color,
            palette,
          );
          const distanceLabel = formatRouteDistance(routeLengthMeters(route));
          const endpointKind =
            activeEndpoint?.routeId === route.id ? activeEndpoint.kind : null;
          const isEditingEndpoint = endpointKind !== null;

          return (
            <article
              key={route.id}
              className={`route-card${isOpen ? " is-open" : ""}`}
            >
              {!isOpen ? (
                <button
                  type="button"
                  className="route-card__delete"
                  onClick={() => removeRoute(route.id)}
                  title="Remove route"
                  aria-label={`Remove ${route.label}`}
                >
                  <CloseIcon />
                </button>
              ) : (
                <button
                  type="button"
                  className="route-card__done"
                  onClick={() =>
                    isEditingEndpoint
                      ? closeEndpointEditor()
                      : closeCard(route.id)
                  }
                  title={isEditingEndpoint ? "Finish endpoint" : "Done"}
                  aria-label={
                    isEditingEndpoint ? "Finish endpoint" : "Done editing route"
                  }
                >
                  <CheckIcon />
                </button>
              )}

              <button
                type="button"
                className="route-card__summary"
                onClick={() => toggleCardOpen(route.id)}
                aria-expanded={isOpen}
                disabled={isEditingEndpoint}
              >
                <span
                  className="route-card__swatch"
                  style={{
                    backgroundColor: route.color,
                    opacity: route.opacity,
                    boxShadow: outline2.active
                      ? `inset 0 0 0 1.5px ${outline2.color}, inset 0 0 0 3px ${outline.color}`
                      : outline.enabled && outline.width > 0
                        ? `inset 0 0 0 2px ${outline.color}`
                        : undefined,
                  }}
                  aria-hidden="true"
                />
                <span className="route-card__meta">
                  <span className="route-card__label">
                    {isEditingEndpoint
                      ? `Edit ${endpointKind === "start" ? "Start" : "Finish"}`
                      : route.label}
                  </span>
                  <span className="route-card__distance">
                    {isEditingEndpoint ? route.label : distanceLabel}
                  </span>
                </span>
              </button>

              {isOpen && isEditingEndpoint
                ? (() => {
                    const endpoint =
                      endpointKind === "start"
                        ? route.startMarker
                        : route.finishMarker;
                    const icon = findMarkerIcon(
                      endpoint.iconId,
                      customMarkerIcons,
                    );
                    const endpointColorChoices = buildDynamicColorChoices(
                      endpoint.color,
                      palette,
                    );
                    const endpointOutlineEnabled =
                      endpoint.outlineEnabled ??
                      DEFAULT_ROUTE_ENDPOINT_OUTLINE_ENABLED;
                    const previewStrokeColor =
                      endpointOutlineEnabled && outline.width > 0
                        ? outline.color
                        : undefined;
                    const previewStrokeWidth =
                      endpointOutlineEnabled && outline.width > 0
                        ? Math.min(2, outline.width)
                        : undefined;
                    const previewOuterStrokeColor =
                      endpointOutlineEnabled && outline2.active
                        ? outline2.color
                        : undefined;
                    const previewOuterStrokeWidth =
                      endpointOutlineEnabled && outline2.active
                        ? Math.min(1.5, outline2.width)
                        : undefined;
                    return (
                      <div className="route-card__body">
                        <div className="route-card__field">
                          <label>
                            <span>Icon</span>
                            <button
                              type="button"
                              className="route-card__endpoint-toggle"
                              onClick={() =>
                                setIsEndpointIconOpen((current) => !current)
                              }
                              aria-expanded={isEndpointIconOpen}
                              aria-label={
                                isEndpointIconOpen
                                  ? "Close icon picker"
                                  : "Change icon"
                              }
                            >
                              {icon ? (
                                <MarkerVisual
                                  icon={icon}
                                  size={22}
                                  color={endpoint.color}
                                  strokeColor={previewStrokeColor}
                                  strokeWidth={previewStrokeWidth}
                                  outerStrokeColor={previewOuterStrokeColor}
                                  outerStrokeWidth={previewOuterStrokeWidth}
                                />
                              ) : null}
                            </button>
                          </label>
                          {isEndpointIconOpen ? (
                            <div className="route-card__endpoint-picker">
                              {predefinedMarkerIcons.map((option) => (
                                <button
                                  key={option.id}
                                  type="button"
                                  className={`route-card__endpoint-option${
                                    option.id === endpoint.iconId
                                      ? " is-selected"
                                      : ""
                                  }`}
                                  onClick={() =>
                                    updateEndpoint(route.id, endpointKind!, {
                                      iconId: option.id,
                                    })
                                  }
                                  title={option.label}
                                  aria-label={option.label}
                                >
                                  <MarkerVisual
                                    icon={option}
                                    size={24}
                                    color={endpoint.color}
                                  />
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <div className="route-card__field">
                          <label>
                            <span>Color</span>
                            <button
                              type="button"
                              className="route-card__color-toggle"
                              style={{
                                backgroundColor: endpoint.color,
                                color: swatchIconColor(endpoint.color),
                              }}
                              onClick={() =>
                                setIsEndpointColorOpen((current) => !current)
                              }
                              aria-label={
                                isEndpointColorOpen
                                  ? "Close color picker"
                                  : "Open color picker"
                              }
                            >
                              {isEndpointColorOpen ? <CloseIcon /> : null}
                            </button>
                          </label>
                          {isEndpointColorOpen ? (
                            <ColorPicker
                              currentColor={endpoint.color}
                              suggestedColors={
                                endpointColorChoices.suggestedColors
                              }
                              moreColors={endpointColorChoices.moreColors}
                              onChange={(color) =>
                                updateEndpoint(route.id, endpointKind!, {
                                  color,
                                })
                              }
                              onResetColor={() =>
                                updateEndpoint(route.id, endpointKind!, {
                                  color:
                                    endpointKind === "start"
                                      ? DEFAULT_ROUTE_START_COLOR
                                      : DEFAULT_ROUTE_FINISH_COLOR,
                                })
                              }
                            />
                          ) : null}
                        </div>

                        <div className="route-card__field">
                          <label
                            htmlFor={`route-${route.id}-${endpointKind}-size`}
                          >
                            <span>Size</span>
                            <span className="route-card__value">
                              {endpoint.size}px
                            </span>
                          </label>
                          <input
                            id={`route-${route.id}-${endpointKind}-size`}
                            type="range"
                            min={MIN_MARKER_SIZE}
                            max={MAX_MARKER_SIZE}
                            step={1}
                            value={endpoint.size}
                            onChange={(event) =>
                              updateEndpoint(route.id, endpointKind!, {
                                size: Number(event.target.value),
                              })
                            }
                          />
                        </div>

                        <label className="toggle-field">
                          <span>Outline (matches route)</span>
                          <span className="theme-switch">
                            <input
                              type="checkbox"
                              checked={endpointOutlineEnabled}
                              onChange={(event) =>
                                updateEndpoint(route.id, endpointKind!, {
                                  outlineEnabled: event.target.checked,
                                })
                              }
                            />
                            <span
                              className="theme-switch-track"
                              aria-hidden="true"
                            />
                          </span>
                        </label>
                      </div>
                    );
                  })()
                : null}

              {isOpen && !isEditingEndpoint ? (
                <div className="route-card__body">
                  <label className="toggle-field">
                    <span>Show endpoints</span>
                    <span className="theme-switch">
                      <input
                        type="checkbox"
                        checked={route.showEndpoints}
                        onChange={(event) =>
                          updateRoute(route.id, {
                            showEndpoints: event.target.checked,
                          })
                        }
                      />
                      <span className="theme-switch-track" aria-hidden="true" />
                    </span>
                  </label>

                  {route.showEndpoints ? (
                    <div className="route-card__endpoint-rows">
                      {(["start", "finish"] as const).map((kind) => {
                        const endpoint =
                          kind === "start"
                            ? route.startMarker
                            : route.finishMarker;
                        const icon = findMarkerIcon(
                          endpoint.iconId,
                          customMarkerIcons,
                        );
                        const label = kind === "start" ? "Start" : "Finish";
                        const endpointOutlineEnabled =
                          endpoint.outlineEnabled ??
                          DEFAULT_ROUTE_ENDPOINT_OUTLINE_ENABLED;
                        return (
                          <button
                            key={kind}
                            type="button"
                            className="route-card__endpoint-row"
                            onClick={() => openEndpointEditor(route.id, kind)}
                            aria-label={`Edit ${label.toLowerCase()} marker`}
                          >
                            <span className="route-card__endpoint-row-icon">
                              {icon ? (
                                <MarkerVisual
                                  icon={icon}
                                  size={24}
                                  color={endpoint.color}
                                  strokeColor={
                                    endpointOutlineEnabled && outline.width > 0
                                      ? outline.color
                                      : undefined
                                  }
                                  strokeWidth={
                                    endpointOutlineEnabled && outline.width > 0
                                      ? Math.min(2, outline.width)
                                      : undefined
                                  }
                                  outerStrokeColor={
                                    endpointOutlineEnabled && outline2.active
                                      ? outline2.color
                                      : undefined
                                  }
                                  outerStrokeWidth={
                                    endpointOutlineEnabled && outline2.active
                                      ? Math.min(1.5, outline2.width)
                                      : undefined
                                  }
                                />
                              ) : null}
                            </span>
                            <span className="route-card__endpoint-row-label">
                              {label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  <div className="route-card__field">
                    <label>
                      <span>Color</span>
                      <button
                        type="button"
                        className="route-card__color-toggle"
                        style={{
                          backgroundColor: route.color,
                          color: swatchIconColor(route.color),
                        }}
                        onClick={() =>
                          setOpenColorPicker(
                            isColorOpen
                              ? null
                              : { routeId: route.id, target: "route" },
                          )
                        }
                        aria-label={
                          isColorOpen
                            ? "Close color picker"
                            : "Open color picker"
                        }
                      >
                        {isColorOpen ? <CloseIcon /> : null}
                      </button>
                    </label>
                    {isColorOpen ? (
                      <ColorPicker
                        currentColor={route.color}
                        suggestedColors={colorChoices.suggestedColors}
                        moreColors={colorChoices.moreColors}
                        onChange={(color) => updateRoute(route.id, { color })}
                        onResetColor={() =>
                          updateRoute(route.id, {
                            color: state.routeDefaults.color,
                          })
                        }
                      />
                    ) : null}
                  </div>

                  <div className="route-card__field">
                    <label htmlFor={`route-width-${route.id}`}>
                      <span>Width</span>
                      <span className="route-card__value">
                        {route.strokeWidth}px
                      </span>
                    </label>
                    <input
                      id={`route-width-${route.id}`}
                      type="range"
                      min={MIN_ROUTE_STROKE_WIDTH}
                      max={MAX_ROUTE_STROKE_WIDTH}
                      step={1}
                      value={route.strokeWidth}
                      onChange={(event) =>
                        updateRoute(route.id, {
                          strokeWidth: Number(event.target.value),
                        })
                      }
                    />
                  </div>

                  <label className="toggle-field">
                    <span>Outline 1</span>
                    <span className="theme-switch">
                      <input
                        type="checkbox"
                        checked={outline.enabled}
                        onChange={(event) => {
                          const enabled = event.target.checked;
                          updateRoute(route.id, { outlineEnabled: enabled });
                          if (
                            !enabled &&
                            (isOutlineColorOpen || isOutline2ColorOpen)
                          ) {
                            setOpenColorPicker(null);
                          }
                        }}
                      />
                      <span className="theme-switch-track" aria-hidden="true" />
                    </span>
                  </label>

                  {outline.enabled ? (
                    <>
                      <div className="route-card__field">
                        <label>
                          <span>Outline 1 color</span>
                          <button
                            type="button"
                            className="route-card__color-toggle"
                            style={{
                              backgroundColor: outline.color,
                              color: swatchIconColor(outline.color),
                            }}
                            onClick={() =>
                              setOpenColorPicker(
                                isOutlineColorOpen
                                  ? null
                                  : { routeId: route.id, target: "outline" },
                              )
                            }
                            aria-label={
                              isOutlineColorOpen
                                ? "Close outline 1 color picker"
                                : "Open outline 1 color picker"
                            }
                          >
                            {isOutlineColorOpen ? <CloseIcon /> : null}
                          </button>
                        </label>
                        {isOutlineColorOpen ? (
                          <ColorPicker
                            currentColor={outline.color}
                            suggestedColors={outlineColorChoices.suggestedColors}
                            moreColors={outlineColorChoices.moreColors}
                            onChange={(color) =>
                              updateRoute(route.id, { outlineColor: color })
                            }
                            onResetColor={() =>
                              updateRoute(route.id, {
                                outlineColor:
                                  state.routeDefaults.outlineColor ??
                                  DEFAULT_ROUTE_OUTLINE_COLOR,
                              })
                            }
                          />
                        ) : null}
                      </div>

                      <div className="route-card__field">
                        <label htmlFor={`route-outline-width-${route.id}`}>
                          <span>Outline 1 width</span>
                          <span className="route-card__value">
                            {outline.width}px
                          </span>
                        </label>
                        <input
                          id={`route-outline-width-${route.id}`}
                          type="range"
                          min={MIN_ROUTE_OUTLINE_WIDTH}
                          max={MAX_ROUTE_OUTLINE_WIDTH}
                          step={0.5}
                          value={outline.width}
                          onChange={(event) =>
                            updateRoute(route.id, {
                              outlineWidth: Number(event.target.value),
                            })
                          }
                        />
                      </div>

                      <label className="toggle-field">
                        <span>Outline 2</span>
                        <span className="theme-switch">
                          <input
                            type="checkbox"
                            checked={outline2.enabled}
                            onChange={(event) => {
                              const enabled = event.target.checked;
                              updateRoute(route.id, {
                                outline2Enabled: enabled,
                              });
                              if (!enabled && isOutline2ColorOpen) {
                                setOpenColorPicker(null);
                              }
                            }}
                          />
                          <span
                            className="theme-switch-track"
                            aria-hidden="true"
                          />
                        </span>
                      </label>

                      {outline2.enabled ? (
                        <>
                          <div className="route-card__field">
                            <label>
                              <span>Outline 2 color</span>
                              <button
                                type="button"
                                className="route-card__color-toggle"
                                style={{
                                  backgroundColor: outline2.color,
                                  color: swatchIconColor(outline2.color),
                                }}
                                onClick={() =>
                                  setOpenColorPicker(
                                    isOutline2ColorOpen
                                      ? null
                                      : {
                                          routeId: route.id,
                                          target: "outline2",
                                        },
                                  )
                                }
                                aria-label={
                                  isOutline2ColorOpen
                                    ? "Close outline 2 color picker"
                                    : "Open outline 2 color picker"
                                }
                              >
                                {isOutline2ColorOpen ? <CloseIcon /> : null}
                              </button>
                            </label>
                            {isOutline2ColorOpen ? (
                              <ColorPicker
                                currentColor={outline2.color}
                                suggestedColors={
                                  outline2ColorChoices.suggestedColors
                                }
                                moreColors={outline2ColorChoices.moreColors}
                                onChange={(color) =>
                                  updateRoute(route.id, {
                                    outline2Color: color,
                                  })
                                }
                                onResetColor={() =>
                                  updateRoute(route.id, {
                                    outline2Color:
                                      state.routeDefaults.outline2Color ??
                                      DEFAULT_ROUTE_OUTLINE2_COLOR,
                                  })
                                }
                              />
                            ) : null}
                          </div>

                          <div className="route-card__field">
                            <label
                              htmlFor={`route-outline2-width-${route.id}`}
                            >
                              <span>Outline 2 width</span>
                              <span className="route-card__value">
                                {outline2.width}px
                              </span>
                            </label>
                            <input
                              id={`route-outline2-width-${route.id}`}
                              type="range"
                              min={MIN_ROUTE_OUTLINE_WIDTH}
                              max={MAX_ROUTE_OUTLINE_WIDTH}
                              step={0.5}
                              value={outline2.width}
                              onChange={(event) =>
                                updateRoute(route.id, {
                                  outline2Width: Number(event.target.value),
                                })
                              }
                            />
                          </div>
                        </>
                      ) : null}
                    </>
                  ) : null}

                  <div className="route-card__field">
                    <label htmlFor={`route-opacity-${route.id}`}>
                      <span>Opacity</span>
                      <span className="route-card__value">
                        {Math.round(route.opacity * 100)}%
                      </span>
                    </label>
                    <input
                      id={`route-opacity-${route.id}`}
                      type="range"
                      min={MIN_ROUTE_OPACITY}
                      max={MAX_ROUTE_OPACITY}
                      step={0.05}
                      value={route.opacity}
                      onChange={(event) =>
                        updateRoute(route.id, {
                          opacity: Number(event.target.value),
                        })
                      }
                    />
                  </div>

                  <div className="route-card__field">
                    <label>
                      <span>Style</span>
                    </label>
                    <div className="route-card__style-toggle">
                      {ROUTE_LINE_STYLES.map((style) => (
                        <button
                          key={style}
                          type="button"
                          className={`route-card__style-btn${route.lineStyle === style ? " is-active" : ""}`}
                          onClick={() =>
                            updateRoute(route.id, { lineStyle: style })
                          }
                        >
                          <span>
                            {style === "solid" ? "Solid" : "Dashed"}
                          </span>
                          <svg
                            className="route-card__style-preview"
                            width="28"
                            height="8"
                            viewBox="0 0 28 8"
                            aria-hidden="true"
                          >
                            <line
                              x1="1"
                              y1="4"
                              x2="27"
                              y2="4"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeDasharray={
                                style === "dashed" ? "4 3" : undefined
                              }
                            />
                          </svg>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="route-card__actions">
                    <button
                      type="button"
                      className="marker-row__icon-btn marker-row__icon-btn--danger"
                      onClick={() => removeRoute(route.id)}
                      title="Remove route"
                    >
                      <TrashIcon />
                      <span className="marker-row__icon-btn-label">
                        Remove Route
                      </span>
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
