"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Returns true for `ms` after `signal` changes from one truthy value to another.
 * Used for the brief "new reading" cue; it never fires on first render.
 */
export function useTransient(signal: string | number | null, ms = 3200) {
  const [active, setActive] = useState(false);
  const previous = useRef(signal);
  useEffect(() => {
    if (!signal || !previous.current || signal === previous.current) {
      previous.current = signal;
      return;
    }
    previous.current = signal;
    const on = setTimeout(() => setActive(true), 0);
    const off = setTimeout(() => setActive(false), ms);
    return () => {
      clearTimeout(on);
      clearTimeout(off);
    };
  }, [signal, ms]);
  return active;
}
