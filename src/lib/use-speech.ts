"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MUTE_KEY = "b1-bear-voice-muted";

function readMuted() {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Browser speech synthesis only — no paid voice or AI provider. Nothing is
 * spoken unless `speak` is called from a user action. Speech is cancelled on
 * unmount and when the page is hidden.
 */
export function useSpeech() {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMutedState] = useState(false);
  const voice = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const pick = () => {
      const voices = synth.getVoices();
      voice.current =
        voices.find((item) => item.lang === "en-GB" && item.localService) ??
        voices.find((item) => item.lang === "en-GB") ??
        voices.find((item) => item.lang.startsWith("en")) ??
        null;
    };
    const ready = setTimeout(() => {
      setSupported(true);
      setMutedState(readMuted());
      pick();
    }, 0);
    synth.addEventListener?.("voiceschanged", pick);
    const hide = () => {
      if (document.visibilityState === "hidden") synth.cancel();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      clearTimeout(ready);
      synth.removeEventListener?.("voiceschanged", pick);
      document.removeEventListener("visibilitychange", hide);
      synth.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window)
      window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!supported || muted || !text) return false;
      const synth = window.speechSynthesis;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      if (voice.current) utterance.voice = voice.current;
      utterance.lang = voice.current?.lang ?? "en-GB";
      utterance.rate = 1;
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      setSpeaking(true);
      synth.speak(utterance);
      return true;
    },
    [supported, muted],
  );

  const setMuted = useCallback(
    (value: boolean) => {
      setMutedState(value);
      if (value) stop();
      try {
        window.localStorage.setItem(MUTE_KEY, value ? "1" : "0");
      } catch {
        /* preference is a convenience only */
      }
    },
    [stop],
  );

  return { supported, speaking, muted, speak, stop, setMuted };
}
