"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { toneLabels, type UnitTone } from "@/lib/fleet-insights";

/* ---------------- Icons (decorative, aria-hidden) ---------------- */
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
export const Icon = {
  refresh: (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <path d="M20 11a8 8 0 0 0-14.6-4.5L4 8" />
      <path d="M4 3v5h5" />
      <path d="M4 13a8 8 0 0 0 14.6 4.5L20 16" />
      <path d="M20 21v-5h-5" />
    </svg>
  ),
  search: (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  ),
  chevron: (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <path d="m9 5 7 7-7 7" />
    </svg>
  ),
  back: (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <path d="m15 5-7 7 7 7" />
    </svg>
  ),
  speaker: (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <path d="M4 10v4h4l5 4V6L8 10H4Z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7" />
    </svg>
  ),
  stop: (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  ),
  mute: (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <path d="M4 10v4h4l5 4V6L8 10H4Z" />
      <path d="m17 9 5 6M22 9l-5 6" />
    </svg>
  ),
  download: (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />
    </svg>
  ),
  pin: (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Z" />
      <circle cx="12" cy="10" r="2.3" />
    </svg>
  ),
};

/* ---------------- Buttons ---------------- */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "ghost";
  size?: "md" | "sm";
  icon?: ReactNode;
};
export function Button({
  variant = "default",
  size = "md",
  icon,
  children,
  className = "",
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`b1-btn ${className}`}
      data-variant={variant}
      data-size={size}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

/** Icon-only button: a visible tooltip-free label is required for AT. */
export function IconButton({
  label,
  icon,
  size = "md",
  variant = "default",
  className = "",
  ...rest
}: Omit<ButtonProps, "children"> & { label: string; icon: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`b1-btn b1-icon-btn ${className}`}
      data-variant={variant}
      data-size={size}
      {...rest}
    >
      {icon}
    </button>
  );
}

/* ---------------- Status indicator ---------------- */
function ToneGlyph({ tone }: { tone: UnitTone }) {
  // Shape differs per tone so status never depends on colour alone.
  const common = { width: 12, height: 12, viewBox: "0 0 12 12", "aria-hidden": true };
  switch (tone) {
    case "recent":
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4.5" fill="currentColor" />
        </svg>
      );
    case "delayed":
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4.3" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M6 1.7a4.3 4.3 0 0 1 0 8.6Z" fill="currentColor" />
        </svg>
      );
    case "stale":
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case "unknown":
      return (
        <svg {...common}>
          <rect x="1.8" y="1.8" width="8.4" height="8.4" rx="1.5" transform="rotate(45 6 6)" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case "error":
      return (
        <svg {...common}>
          <path d="M6 1.3 11 10.3H1Z" fill="currentColor" />
        </svg>
      );
    case "loading":
      return (
        <svg {...common} className="b1-spin">
          <circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="14 40" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M2 6h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
  }
}

export function StatusIndicator({
  tone,
  label,
  pill = false,
}: {
  tone: UnitTone;
  label?: string;
  pill?: boolean;
}) {
  return (
    <span className="b1-status" data-tone={tone} data-pill={pill || undefined}>
      <ToneGlyph tone={tone} />
      {label ?? toneLabels[tone]}
    </span>
  );
}

/* ---------------- Segmented control (single choice) ---------------- */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  wrap = false,
}: {
  label: string;
  wrap?: boolean;
  options: { value: T; label: string; title?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const group = useId();
  const reduce = useReducedMotion();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(event: KeyboardEvent, index: number) {
    const delta =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }
  return (
    <div className="b1-seg" data-wrap={wrap || undefined} role="radiogroup" aria-label={label}>
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={String(option.value)}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            title={option.title}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKey(event, index)}
          >
            {checked && (
              <motion.span
                layoutId={`${group}-thumb`}
                className="b1-seg-thumb"
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40 }}
              />
            )}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Skeleton ---------------- */
export function Skeleton({
  width = "100%",
  height = "1rem",
  className = "",
}: {
  width?: string;
  height?: string;
  className?: string;
}) {
  return <span aria-hidden="true" className={`b1-skel ${className}`} style={{ width, height }} />;
}

/* ---------------- Breadcrumbs ---------------- */
export function Breadcrumbs({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="b1-crumbs">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-2">
            {index > 0 && <span aria-hidden="true">/</span>}
            {item.href && index < items.length - 1 ? (
              <Link href={item.href}>{item.label}</Link>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
