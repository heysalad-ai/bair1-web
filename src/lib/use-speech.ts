"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthenticatedFetch } from "./use-authenticated-fetch";
import { SpeechPlayback, type SpeechState } from "./speech-playback";
const MUTE_KEY = "b1-bear-voice-muted";
export function useSpeech(animate = true) {
  const request = useAuthenticatedFetch();
  const [supported, setSupported] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [state, setState] = useState<SpeechState>({
    loading: false,
    speaking: false,
    error: "",
  });
  const playback = useRef<SpeechPlayback | null>(null);
  useEffect(() => {
    let active = true;
    const player = new SpeechPlayback(
      request,
      (next) => {
        if (active) setState(next);
      },
      undefined,
      animate,
    );
    playback.current = player;
    const ready = setTimeout(() => {
      setState({ loading: false, speaking: false, error: "" });
      setSupported(typeof Audio !== "undefined");
      try {
        setMutedState(window.localStorage.getItem(MUTE_KEY) === "1");
      } catch {
        /* optional preference */
      }
    }, 0);
    const hide = () => {
      if (document.visibilityState === "hidden") player.stop();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      active = false;
      clearTimeout(ready);
      document.removeEventListener("visibilitychange", hide);
      player.stop();
      playback.current = null;
    };
  }, [request, animate]);
  const stop = useCallback(() => playback.current?.stop(), []);
  const speak = useCallback(
    (text: string) => {
      if (!supported || muted || !text) return false;
      void playback.current?.speak(text);
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
        /* optional preference */
      }
    },
    [stop],
  );
  return { supported, ...state, muted, speak, stop, setMuted };
}
