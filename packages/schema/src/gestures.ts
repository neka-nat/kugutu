import type { SlotKey } from "./slots.js";

/**
 * A keyframe within a gesture track. `t` is normalized time in [0, 1].
 * Offsets use the same units as {@link ExpressionPose}: translate in SVG user
 * units, rotate in degrees, scale as a fractional multiplicative delta.
 */
export interface GestureKeyframe {
  t: number;
  translateX?: number;
  translateY?: number;
  rotate?: number;
  scaleX?: number;
  scaleY?: number;
}

export interface GestureTrack {
  slot: SlotKey;
  keyframes: GestureKeyframe[];
}

/** A named, time-based animation played once (or looped) via `playGesture`. */
export interface CharacterGesture {
  id: string;
  durationMs: number;
  loop?: boolean;
  tracks: GestureTrack[];
}

/**
 * Built-in gesture library, compiled into the bundle. Tracks targeting slots a
 * character lacks are dropped at compile time, so e.g. `wave` is only included
 * when arm slots are bound.
 */
export const DEFAULT_GESTURES: CharacterGesture[] = [
  {
    id: "nod",
    durationMs: 620,
    tracks: [
      {
        slot: "head",
        keyframes: [
          { t: 0, translateY: 0, rotate: 0 },
          { t: 0.4, translateY: 8, rotate: 3 },
          { t: 1, translateY: 0, rotate: 0 },
        ],
      },
    ],
  },
  {
    id: "shake",
    durationMs: 640,
    tracks: [
      {
        slot: "head",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.25, rotate: -7 },
          { t: 0.5, rotate: 7 },
          { t: 0.75, rotate: -5 },
          { t: 1, rotate: 0 },
        ],
      },
    ],
  },
  {
    id: "bounce",
    durationMs: 560,
    tracks: [
      {
        slot: "torso",
        keyframes: [
          { t: 0, translateY: 0 },
          { t: 0.45, translateY: -9 },
          { t: 1, translateY: 0 },
        ],
      },
      {
        slot: "head",
        keyframes: [
          { t: 0, translateY: 0 },
          { t: 0.45, translateY: -9 },
          { t: 1, translateY: 0 },
        ],
      },
    ],
  },
  {
    id: "wave",
    durationMs: 900,
    tracks: [
      {
        slot: "upperArm.r",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.2, rotate: -22 },
          { t: 0.5, rotate: -10 },
          { t: 0.8, rotate: -22 },
          { t: 1, rotate: 0 },
        ],
      },
      {
        slot: "forearm.r",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.2, rotate: -16 },
          { t: 0.5, rotate: 8 },
          { t: 0.8, rotate: -16 },
          { t: 1, rotate: 0 },
        ],
      },
    ],
  },
];
