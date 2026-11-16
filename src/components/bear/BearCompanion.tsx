"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useId, useState } from "react";
import type { BearMood } from "@/lib/bear-state";
import { useSpeech } from "@/lib/use-speech";
import { Button, Icon } from "@/components/ui/kit";
import BearFigure from "./BearFigure";

const GREETED_KEY = "b1-bear-greeted";

function shouldGreet() {
  try {
    if (window.sessionStorage.getItem(GREETED_KEY)) return false;
    window.sessionStorage.setItem(GREETED_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

/**
 * Bear One companion. `mood` and `message` must come from real UI state
 * (see src/lib/bear-state.ts). `summary` is optional text the viewer can
 * choose to hear; it is shown verbatim and never autoplayed.
 */
export default function BearCompanion({
  mood,
  message,
  summary,
  size = 88,
  layout = "row",
  greet = false,
}: {
  mood: BearMood;
  message: string;
  summary?: string;
  size?: number;
  layout?: "row" | "stack";
  greet?: boolean;
}) {
  const reduce = useReducedMotion();
  const speech = useSpeech(!reduce);
  const { stop } = speech;
  const panelId = useId();
  const [greeting, setGreeting] = useState(false);
  const [spoken, setSpoken] = useState<string | null>(null);

  useEffect(() => {
    if (!greet) return;
    const start = setTimeout(() => setGreeting(shouldGreet()), 0);
    const end = setTimeout(() => setGreeting(false), 2400);
    return () => {
      clearTimeout(start);
      clearTimeout(end);
    };
  }, [greet]);

  // Readings moved on: stop reading out text that is no longer current.
  useEffect(() => {
    stop();
  }, [summary, stop]);

  const shown: BearMood = speech.speaking
    ? "speaking"
    : speech.loading
      ? "loading"
      : greeting && (mood === "idle" || mood === "loading")
        ? "greeting"
        : mood;

  function readSummary() {
    if (!summary) return;
    setSpoken(summary);
    speech.speak(summary);
  }

  return (
    <div className="b1-bear" data-layout={layout}>
      <div className="b1-bear-figure">
        <BearFigure mood={shown} size={size} face={speech.face} />
      </div>
      <div className="b1-bubble">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={message}
            role="status"
            aria-live="polite"
            initial={reduce ? false : { opacity: 0.4, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0.4, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            {message}
          </motion.p>
        </AnimatePresence>
        {summary && (
          <>
            <div className="b1-bubble-actions">
              {speech.speaking || speech.loading ? (
                <Button size="sm" icon={Icon.stop} onClick={speech.stop}>
                  {speech.loading ? "Cancel voice" : "Stop reading"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  icon={Icon.speaker}
                  onClick={readSummary}
                  aria-expanded={spoken !== null}
                  aria-controls={panelId}
                >
                  {speech.supported && !speech.muted
                    ? "Read summary"
                    : "Show summary"}
                </Button>
              )}
              {speech.supported && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={speech.muted ? Icon.speaker : Icon.mute}
                  aria-pressed={speech.muted}
                  onClick={() => speech.setMuted(!speech.muted)}
                >
                  {speech.muted ? "Voice off" : "Mute voice"}
                </Button>
              )}
              {spoken !== null && !speech.speaking && !speech.loading && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSpoken(null)}
                >
                  Hide
                </Button>
              )}
            </div>
            <p className="mt-2 text-xs text-[var(--b1-muted)]">
              AI-generated voice · OpenAI
            </p>
            {speech.speaking &&
              speech.face &&
              !reduce &&
              speech.faceStatus === "ready" && (
                <p className="mt-2 text-xs text-[var(--b1-muted)]">
                  Facial motion · NVIDIA
                </p>
              )}
            {speech.speaking && speech.faceStatus === "unavailable" && (
              <p className="mt-2 text-xs text-[var(--b1-muted)]">
                Face animation is unavailable. Your voice summary is still
                playing.
              </p>
            )}
            {speech.loading && (
              <p role="status" className="mt-2 text-sm">
                Preparing your voice summary…
              </p>
            )}
            {speech.error && (
              <p role="alert" className="mt-2 text-sm">
                {speech.error}
              </p>
            )}
            <div id={panelId}>
              {spoken !== null && (
                <div className="b1-speech">
                  <span className="b1-speech-label">
                    {speech.supported && !speech.muted
                      ? "Spoken text"
                      : "Summary"}
                  </span>
                  <p>{spoken}</p>
                  {spoken !== summary && (
                    <p className="mt-2 text-xs">
                      The summary has changed since this was read.{" "}
                      <button
                        type="button"
                        className="b1-focus underline underline-offset-2"
                        onClick={readSummary}
                      >
                        Use the latest
                      </button>
                    </p>
                  )}
                  {!speech.supported && (
                    <p className="mt-2 text-xs">
                      Audio playback isn’t available in this browser, so the
                      summary is shown here instead.
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
