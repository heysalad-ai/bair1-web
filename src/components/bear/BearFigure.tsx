"use client";

import { motion, useReducedMotion, type Transition } from "framer-motion";
import { useId } from "react";
import type { FacePose } from "@/lib/face-animation";
import type { BearMood } from "@/lib/bear-state";

/**
 * Vector redraw of the Bear One logo (public/bear-logo.png): same brown head,
 * tan muzzle, heavy black outline and lime orb, split into animatable parts.
 * Orb colour here signals data status only — it never rates air quality.
 */
const LINE = "var(--b1-bear-line, #141414)";
const BROWN = "var(--b1-bear-brown, #9c5626)";
const TAN = "var(--b1-bear-tan, #e9b27a)";
const ORB = "var(--b1-orb, #a8d51e)";
const SW = 14;

const HEAD =
  "M190,945 C196,880 222,820 262,770 L258,752 C252,725 262,700 282,688 L242,690 C258,664 268,645 276,628 L232,630 C256,598 266,560 268,510 C250,450 270,385 330,358 C400,300 500,280 578,305 C620,280 680,240 720,228 C755,218 772,238 782,262 C805,330 805,430 770,520 C745,565 715,590 722,628 L752,655 L722,662 C738,688 750,700 765,702 L735,708 C740,725 742,738 748,748 C790,780 815,820 822,838 L800,845 C820,870 838,905 845,945 C700,1000 340,1000 190,945 Z";
const EAR =
  "M330,360 C300,325 245,318 205,345 C170,370 160,425 185,470 C205,505 245,515 272,508";
const EAR_INNER =
  "M314,410 C300,384 262,378 240,395 C222,410 226,445 250,458 C262,464 276,468 286,470 Z";
const MUZZLE =
  "M585,300 C562,350 588,430 578,500 C568,560 580,620 628,632 C690,640 740,590 770,520 C805,430 800,330 775,255 C740,190 680,200 630,250 C610,270 595,285 585,300 Z";
const NOSE =
  "M688,262 C690,240 730,226 758,234 C776,242 778,270 762,285 C742,300 700,292 688,262 Z";
const MOUTH = "M676,440 C700,462 752,455 768,400 C776,360 772,310 762,290";
const EYE_CLOSED = "M468,398 C492,418 532,410 534,362";
const PAW =
  "M288,1060 C282,960 298,872 336,830 C368,796 424,800 436,846 C450,898 430,975 422,1060 Z";
const PAW_PAD = "M330,905 C330,870 400,870 400,905 C400,945 330,945 330,905 Z";
const PAW_TOES =
  "M338,842 C345,826 362,824 370,838 M376,834 C384,820 402,822 408,838";

const loop = (duration: number, delay = 0): Transition => ({
  duration,
  delay,
  repeat: Infinity,
  ease: "easeInOut",
});

export default function BearFigure({
  mood,
  size = 96,
  title,
  face,
}: {
  mood: BearMood;
  size?: number;
  title?: string;
  face?: FacePose;
}) {
  const reduce = useReducedMotion();
  const id = useId().replace(/:/g, "");
  const eyeOpen = mood !== "empty";
  const orbFill = mood === "empty" ? "var(--b1-surface-3, #2a332d)" : ORB;
  const animate = !reduce;
  const pose = animate && mood === "speaking" ? face : undefined;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      data-mood={mood}
    >
      <defs>
        <clipPath id={`${id}-head`}>
          <path d={HEAD} />
        </clipPath>
        <clipPath id={`${id}-frame`}>
          <rect x="-200" y="-200" width="1424" height="1224" />
        </clipPath>
      </defs>

      {/* Orb: floats gently; pops on new data; ring for loading/attention */}
      <motion.g
        style={{ transformOrigin: "533px 120px", transformBox: "view-box" }}
        animate={
          !animate
            ? undefined
            : mood === "newData"
              ? { scale: [1, 1.22, 0.96, 1], y: [0, -14, 0] }
              : mood === "empty"
                ? { y: 0, scale: 1 }
                : { y: [0, -10, 0], scale: 1 }
        }
        transition={
          mood === "newData"
            ? { duration: 0.9, ease: [0.22, 1, 0.36, 1] }
            : loop(mood === "loading" ? 1.6 : 3.4)
        }
      >
        <circle
          cx="533"
          cy="120"
          r="88"
          fill={orbFill}
          stroke={LINE}
          strokeWidth={SW}
          strokeDasharray={mood === "empty" ? "28 20" : undefined}
        />
        {mood !== "empty" && (
          <circle cx="505" cy="92" r="20" fill="#fff" opacity="0.35" />
        )}
        {mood === "loading" && (
          <motion.circle
            cx="533"
            cy="120"
            r="118"
            fill="none"
            stroke="var(--b1-primary, #a8d51e)"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray="120 620"
            style={{ transformOrigin: "533px 120px", transformBox: "view-box" }}
            animate={animate ? { rotate: 360 } : undefined}
            transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
          />
        )}
        {mood === "attention" && (
          <motion.circle
            cx="533"
            cy="120"
            r="112"
            fill="none"
            stroke="var(--b1-warn, #e8c35a)"
            strokeWidth="12"
            style={{ transformOrigin: "533px 120px", transformBox: "view-box" }}
            initial={false}
            animate={
              animate
                ? { scale: [1, 1.14, 1], opacity: [0.9, 0.35, 0.9] }
                : { opacity: 0.9 }
            }
            transition={
              animate
                ? { duration: 1.6, repeat: 2, ease: "easeInOut" }
                : undefined
            }
          />
        )}
      </motion.g>

      {/* Whole bear: breathing + small head tilt per mood */}
      <motion.g
        style={{ transformOrigin: "512px 990px", transformBox: "view-box" }}
        animate={
          !animate
            ? undefined
            : mood === "greeting"
              ? { rotate: [0, -4, 0, -3, 0], scaleY: 1 }
              : mood === "attention"
                ? { rotate: [0, -2.5, -2.5, 0], scaleY: 1 }
                : mood === "empty"
                  ? { rotate: 2, scaleY: [1, 1.008, 1] }
                  : { rotate: 0, scaleY: [1, 1.014, 1] }
        }
        transition={
          mood === "greeting"
            ? { duration: 1.8, ease: "easeInOut" }
            : mood === "attention"
              ? { duration: 2.2, ease: "easeInOut" }
              : {
                  scaleY: loop(mood === "empty" ? 6 : 4.4),
                  rotate: { duration: 0.6 },
                }
        }
      >
        <path
          d={EAR}
          fill={BROWN}
          stroke={LINE}
          strokeWidth={SW}
          strokeLinejoin="round"
        />
        <path
          d={EAR_INNER}
          fill={TAN}
          stroke={LINE}
          strokeWidth={SW}
          strokeLinejoin="round"
        />
        <path d={HEAD} fill={BROWN} />
        <motion.g
          clipPath={`url(#${id}-head)`}
          style={{ transformOrigin: "690px 440px", transformBox: "view-box" }}
          animate={
            pose
              ? { scaleY: 1 + pose.jaw * 0.035 }
              : animate && mood === "speaking"
                ? { scaleY: [1, 1.035, 1] }
                : { scaleY: 1 }
          }
          transition={
            pose
              ? { duration: 0 }
              : animate && mood === "speaking"
                ? loop(0.42)
                : { duration: 0.2 }
          }
        >
          <path d={MUZZLE} fill={TAN} stroke={LINE} strokeWidth={SW} />
          <path
            d={MOUTH}
            fill="none"
            stroke={LINE}
            strokeWidth={SW}
            strokeLinecap="round"
          />
          {pose && (
            <ellipse
              cx="715"
              cy={441 - pose.smile * 5}
              rx={24 - pose.pucker * 10}
              ry={pose.jaw * 22}
              fill={LINE}
              transform="rotate(-14 715 441)"
            />
          )}
        </motion.g>
        <path
          d={HEAD}
          fill="none"
          stroke={LINE}
          strokeWidth={SW}
          strokeLinejoin="round"
        />

        {/* Nose: sniffs while loading (the bear's job is sniffing the air) */}
        <motion.path
          d={NOSE}
          fill="#2a2422"
          stroke={LINE}
          strokeWidth={SW / 2}
          animate={
            animate && mood === "loading" ? { y: [0, -9, 0, -6, 0] } : { y: 0 }
          }
          transition={
            animate && mood === "loading"
              ? { duration: 0.9, repeat: Infinity, repeatDelay: 0.6 }
              : { duration: 0.2 }
          }
        />

        {/* Eye: open + blinking when attentive, closed (logo pose) when resting */}
        {eyeOpen ? (
          <motion.g
            style={{ transformOrigin: "505px 386px", transformBox: "view-box" }}
            animate={
              pose
                ? { scaleY: Math.max(0.08, 1 - pose.blink) }
                : animate
                  ? { scaleY: [1, 1, 0.08, 1] }
                  : undefined
            }
            transition={
              pose
                ? { duration: 0 }
                : animate
                  ? {
                      duration: 0.28,
                      times: [0, 0.4, 0.6, 1],
                      repeat: Infinity,
                      repeatDelay: 3.6 + (mood === "idle" ? 1.4 : 0),
                    }
                  : undefined
            }
          >
            <ellipse cx="505" cy="386" rx="23" ry="28" fill={LINE} />
            <circle cx="513" cy="375" r="7.5" fill="#fff" />
          </motion.g>
        ) : (
          <path
            d={EYE_CLOSED}
            fill="none"
            stroke={LINE}
            strokeWidth={SW}
            strokeLinecap="round"
          />
        )}
      </motion.g>

      {/* Paw: a single brief wave for greeting only */}
      {mood === "greeting" && (
        <g clipPath={`url(#${id}-frame)`}>
          <motion.g
            style={{
              transformOrigin: "356px 1000px",
              transformBox: "view-box",
            }}
            initial={animate ? { y: 260, rotate: 0 } : false}
            animate={
              animate
                ? { y: [260, 0, 0, 0, 0, 260], rotate: [0, -14, 12, -10, 0, 0] }
                : { y: 0 }
            }
            transition={
              animate
                ? {
                    duration: 2.2,
                    times: [0, 0.22, 0.42, 0.62, 0.8, 1],
                    ease: "easeInOut",
                  }
                : undefined
            }
          >
            <path
              d={PAW}
              fill={BROWN}
              stroke={LINE}
              strokeWidth={SW}
              strokeLinejoin="round"
            />
            <path d={PAW_PAD} fill={TAN} stroke={LINE} strokeWidth={SW / 1.4} />
            <path
              d={PAW_TOES}
              fill="none"
              stroke={LINE}
              strokeWidth={SW / 1.4}
              strokeLinecap="round"
            />
          </motion.g>
        </g>
      )}
    </svg>
  );
}
