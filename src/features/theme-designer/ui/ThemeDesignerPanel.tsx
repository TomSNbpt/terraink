import { useEffect, useMemo, useRef, useState } from "react";
import ThemeCard from "@/features/theme/ui/ThemeCard";
import SaveThemeModal from "@/features/theme/ui/SaveThemeModal";
import ConfirmModal from "@/shared/ui/ConfirmModal";
import {
  BackIcon,
  CloseIcon,
  LoaderIcon,
  SendIcon,
} from "@/shared/ui/Icons";
import type {
  ResolvedTheme,
  SavedTheme,
  ThemeColors,
} from "@/features/theme/domain/types";
import {
  generatedThemeToOption,
  type DesignerMessage,
  type GeneratedTheme,
  type ResolvedRouteOverlay,
  type ThemeDesignerSession,
} from "../domain/types";
import { sendThemeDesignerMessage } from "../infrastructure/themeDesignerApi";

const STARTER_PROMPTS = [
  "Chicago Marathon theme + route overlay",
  "Vermont Long Trail",
  "Add Chicago Marathon route overlay",
];

function formatRouteSourceLabel(
  method: ResolvedRouteOverlay["sourceMethod"],
): string {
  switch (method) {
    case "gpx-url":
      return "Official GPX";
    case "osm-relation":
      return "OSM trail/course";
    case "street-routed":
      return "Street-snapped";
    default:
      return "Course waypoints";
  }
}

interface ThemeDesignerPanelProps {
  session: ThemeDesignerSession;
  savedThemes: SavedTheme[];
  currentMapTheme: ResolvedTheme;
  onClose: () => void;
  onAddUserMessage: (message: DesignerMessage) => void;
  onAddAssistantResponse: (
    message: DesignerMessage,
    themes: GeneratedTheme[],
  ) => void;
  onAddAiRouteOverlay: (overlay: ResolvedRouteOverlay) => void;
  onSelectGeneratedTheme: (themeId: string | null) => void;
  onSaveGeneratedTheme: (
    generatedTheme: GeneratedTheme,
    name: string,
    description: string,
  ) => void;
  onClearSession: () => void;
}

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function ThemeDesignerPanel({
  session,
  savedThemes,
  currentMapTheme,
  onClose,
  onAddUserMessage,
  onAddAssistantResponse,
  onAddAiRouteOverlay,
  onSelectGeneratedTheme,
  onSaveGeneratedTheme,
  onClearSession,
}: ThemeDesignerPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [pendingSaveTheme, setPendingSaveTheme] =
    useState<GeneratedTheme | null>(null);
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  const generatedListRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const activeGeneratedTheme = useMemo(
    () =>
      session.activeGeneratedThemeId
        ? (session.generatedThemes.find(
            (t) => t.id === session.activeGeneratedThemeId,
          ) ?? null)
        : null,
    [session.activeGeneratedThemeId, session.generatedThemes],
  );

  // Display newest batch at the top while keeping 1, 2, 3 order within each batch.
  const orderedGeneratedThemes = useMemo(() => {
    const batches: GeneratedTheme[][] = [];
    for (const theme of session.generatedThemes) {
      const lastBatch = batches[batches.length - 1];
      if (lastBatch && lastBatch[0]?.createdAt === theme.createdAt) {
        lastBatch.push(theme);
      } else {
        batches.push([theme]);
      }
    }
    return batches.reverse().flat();
  }, [session.generatedThemes]);

  const hasSessionData =
    session.messages.length > 0 || session.generatedThemes.length > 0;

  useEffect(() => {
    const el = chatLogRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [session.messages.length, isSending]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  async function submitPrompt(rawText: string) {
    const trimmed = rawText.trim();
    if (!trimmed || isSending) return;

    setErrorMessage("");
    setPrompt("");

    const userMsg: DesignerMessage = {
      id: createId("msg-user"),
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    onAddUserMessage(userMsg);

    const historyForApi = [...session.messages, userMsg];
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsSending(true);

    const referenceTheme = activeGeneratedTheme ?? {
      name: currentMapTheme.name,
      description: currentMapTheme.description,
      colors: {
        ui: currentMapTheme.ui,
        map: currentMapTheme.map,
      },
    };

    try {
      const result = await sendThemeDesignerMessage({
        messages: historyForApi,
        selectedTheme: referenceTheme,
        selectedThemeIsGenerated: Boolean(activeGeneratedTheme),
        existingThemeNames: session.generatedThemes.map((t) => t.name),
        signal: controller.signal,
      });

      const now = new Date().toISOString();
      const createdThemes: GeneratedTheme[] = result.themes.map((proposal) => ({
        id: createId("ai-theme"),
        name: proposal.name,
        description: proposal.description,
        colors: proposal.colors as ThemeColors,
        createdAt: now,
      }));

      const addedRouteSummary = result.routeOverlay
        ? `Added route "${result.routeOverlay.label}" · ${result.routeOverlay.pointCount.toLocaleString()} pts (${formatRouteSourceLabel(result.routeOverlay.sourceMethod)})`
        : undefined;

      const assistantMsg: DesignerMessage = {
        id: createId("msg-ai"),
        role: "assistant",
        content: result.reply,
        createdAt: now,
        ...(createdThemes.length > 0
          ? { generatedThemeIds: createdThemes.map((t) => t.id) }
          : {}),
        ...(addedRouteSummary ? { addedRouteSummary } : {}),
      };

      onAddAssistantResponse(assistantMsg, createdThemes);

      if (result.routeOverlay) {
        onAddAiRouteOverlay(result.routeOverlay);
      }

      if (createdThemes.length > 0) {
        if (generatedListRef.current) {
          generatedListRef.current.scrollTop = 0;
        }
      }
    } catch (error) {
      if ((error as { name?: string })?.name === "AbortError") {
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : "Unable to generate themes right now. Please try again.";
      setErrorMessage(message);
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setIsSending(false);
    }
  }

  function handleFormSubmit(event: React.FormEvent) {
    event.preventDefault();
    void submitPrompt(prompt);
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitPrompt(prompt);
    }
  }

  function handleConfirmClear() {
    abortControllerRef.current?.abort();
    setIsSending(false);
    setErrorMessage("");
    setPrompt("");
    onClearSession();
    setIsClearConfirmOpen(false);
  }

  function handleConfirmSaveTheme(name: string, description: string) {
    if (!pendingSaveTheme) return;
    onSaveGeneratedTheme(pendingSaveTheme, name, description);
    setPendingSaveTheme(null);
  }

  return (
    <div className="theme-designer-view">
      <div className="theme-designer-topbar">
        <button
          type="button"
          className="theme-designer-back-btn"
          onClick={onClose}
          aria-label="Back to themes"
        >
          <BackIcon aria-hidden="true" />
          <span>Themes</span>
        </button>

        <span className="theme-designer-title">Theme Designer</span>

        <button
          type="button"
          className="theme-designer-clear-btn"
          onClick={() => setIsClearConfirmOpen(true)}
          disabled={!hasSessionData && !isSending}
          title="Clear chat history and generated themes"
        >
          CLEAR
        </button>
      </div>

      {orderedGeneratedThemes.length > 0 ? (
        <section className="theme-designer-gallery" aria-label="Generated themes">
          <div className="theme-designer-gallery-head">
            <h3 className="theme-section-heading">
              Generated Themes &middot; {orderedGeneratedThemes.length}
            </h3>
            {activeGeneratedTheme ? (
              <div className="theme-designer-active-context">
                <span
                  className="theme-designer-active-label"
                  title={`Refining ${activeGeneratedTheme.name}`}
                >
                  Refining: {activeGeneratedTheme.name}
                </span>
                <button
                  type="button"
                  className="theme-designer-deselect-btn"
                  onClick={() => onSelectGeneratedTheme(null)}
                  title="Stop refining this theme"
                  aria-label="Stop refining selected theme"
                >
                  <CloseIcon aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </div>

          <div
            ref={generatedListRef}
            className="theme-card-list card-scroll-list theme-designer-cards"
            role="list"
          >
            {orderedGeneratedThemes.map((theme) => (
              <ThemeCard
                key={theme.id}
                themeOption={generatedThemeToOption(theme)}
                isSelected={session.activeGeneratedThemeId === theme.id}
                onClick={() => onSelectGeneratedTheme(theme.id)}
                onSave={() => setPendingSaveTheme(theme)}
                saveAriaLabel={`Save ${theme.name} as custom theme`}
                isSaved={Boolean(theme.savedThemeId)}
              />
            ))}
          </div>
          {activeGeneratedTheme?.description ? (
            <p className="theme-designer-active-desc">
              {activeGeneratedTheme.description}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="theme-designer-chat" aria-label="Theme designer chat">
        <div ref={chatLogRef} className="theme-designer-messages">
          {session.messages.length === 0 ? (
            <div className="theme-designer-empty">
              <p className="theme-designer-empty-title">
                Describe an event, trail, or mood
              </p>
              <p className="theme-designer-empty-text">
                I&apos;ll research official colors for 3 CMYK-safe palettes, or
                add a race/trail route overlay directly onto your map.
              </p>
              <div className="theme-designer-starters">
                {STARTER_PROMPTS.map((example) => (
                  <button
                    key={example}
                    type="button"
                    className="theme-designer-starter-btn"
                    onClick={() => void submitPrompt(example)}
                    disabled={isSending}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            session.messages.map((msg) => (
              <div
                key={msg.id}
                className={`theme-designer-msg theme-designer-msg--${msg.role}`}
              >
                <p className="theme-designer-msg-text">{msg.content}</p>
                {msg.generatedThemeIds && msg.generatedThemeIds.length > 0 ? (
                  <p className="theme-designer-msg-meta">
                    Added {msg.generatedThemeIds.length} print-safe{" "}
                    {msg.generatedThemeIds.length === 1 ? "option" : "options"}{" "}
                    above
                  </p>
                ) : null}
                {msg.addedRouteSummary ? (
                  <p className="theme-designer-msg-meta">
                    {msg.addedRouteSummary}
                  </p>
                ) : null}
              </div>
            ))
          )}

          {isSending ? (
            <div
              className="theme-designer-msg theme-designer-msg--loading"
              role="status"
            >
              <LoaderIcon
                className="theme-designer-spinner"
                aria-hidden="true"
              />
              <span>Researching &amp; building your map design&hellip;</span>
            </div>
          ) : null}
        </div>

        {errorMessage ? (
          <p className="theme-designer-error" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <div className="theme-designer-composer">
          <textarea
            className="theme-designer-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={
              activeGeneratedTheme
                ? `Tweak "${activeGeneratedTheme.name}" or ask to add a race/trail route…`
                : "e.g. Chicago Marathon, or add the Boston Marathon route overlay…"
            }
            rows={2}
            disabled={isSending}
            aria-label="Theme designer prompt"
          />
          <button
            type="button"
            className="theme-designer-send-btn"
            onClick={handleFormSubmit}
            disabled={isSending || prompt.trim().length === 0}
            aria-label="Send theme request"
            title="Send"
          >
            <SendIcon aria-hidden="true" />
          </button>
        </div>
      </section>

      {isClearConfirmOpen ? (
        <ConfirmModal
          title="Clear Theme Designer"
          message="Remove the current AI chat history and all unsaved themes generated in this session? Saved custom themes will not be affected."
          confirmLabel="Clear"
          cancelLabel="Cancel"
          destructive
          onConfirm={handleConfirmClear}
          onCancel={() => setIsClearConfirmOpen(false)}
        />
      ) : null}

      {pendingSaveTheme ? (
        <SaveThemeModal
          suggestedName={pendingSaveTheme.name}
          suggestedDescription={pendingSaveTheme.description}
          existingNames={savedThemes.map((t) => t.name)}
          onConfirm={handleConfirmSaveTheme}
          onCancel={() => setPendingSaveTheme(null)}
        />
      ) : null}
    </div>
  );
}
