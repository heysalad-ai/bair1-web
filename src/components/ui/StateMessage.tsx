"use client";

import type { ReactNode } from "react";
import BearFigure from "@/components/bear/BearFigure";
import type { BearMood } from "@/lib/bear-state";

/** Empty, error, unavailable and access-denied states share one shape. */
export default function StateMessage({
  kind,
  title,
  children,
  actions,
  headingLevel = 2,
}: {
  kind: "empty" | "error" | "unavailable" | "denied" | "loading";
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  headingLevel?: 1 | 2 | 3;
}) {
  const mood: BearMood =
    kind === "empty" || kind === "unavailable"
      ? "empty"
      : kind === "loading"
        ? "loading"
        : "attention";
  const Heading = `h${headingLevel}` as "h2";
  return (
    <div
      className="b1-card b1-state"
      role={kind === "error" || kind === "denied" ? "alert" : kind === "loading" ? "status" : undefined}
    >
      <BearFigure mood={mood} size={72} />
      <div className="min-w-0">
        <Heading className="b1-state-title">{title}</Heading>
        {children && <div className="[&>p]:mt-1.5">{children}</div>}
        {actions && <div className="b1-state-actions">{actions}</div>}
      </div>
    </div>
  );
}
