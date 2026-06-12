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
    // FK chain: forearm/hand rotations are RELATIVE to the parent joint (the
    // shoulder lift propagates down the chain). The upper arm lifts the resting
    // arm up beside the face, then the forearm wags side to side for a friendly
    // wave. Angles assume the relaxed open rest pose (upper arm points slightly
    // down-and-out, forearm folds back up).
    id: "wave",
    durationMs: 1100,
    tracks: [
      {
        slot: "upperArm.r",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.18, rotate: -74 },
          { t: 0.85, rotate: -74 },
          { t: 1, rotate: 0 },
        ],
      },
      {
        slot: "forearm.r",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.18, rotate: -22 },
          { t: 0.36, rotate: 2 },
          { t: 0.54, rotate: -22 },
          { t: 0.72, rotate: 2 },
          { t: 0.85, rotate: -14 },
          { t: 1, rotate: 0 },
        ],
      },
    ],
  },
  {
    // Right arm lifts straight up high beside the face in a clear greeting.
    id: "raise-hand",
    durationMs: 760,
    tracks: [
      {
        slot: "upperArm.r",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.35, rotate: -78 },
          { t: 0.8, rotate: -78 },
          { t: 1, rotate: 0 },
        ],
      },
      {
        slot: "forearm.r",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.35, rotate: -8 },
          { t: 0.8, rotate: -8 },
          { t: 1, rotate: 0 },
        ],
      },
    ],
  },
  {
    // Right arm extends up and out, the forearm straightening out of the rest
    // fold (positive delta unfolds the elbow) for a presenting / pointing pose.
    id: "point",
    durationMs: 680,
    tracks: [
      {
        slot: "upperArm.r",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.4, rotate: -46 },
          { t: 0.82, rotate: -46 },
          { t: 1, rotate: 0 },
        ],
      },
      {
        slot: "forearm.r",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.4, rotate: 58 },
          { t: 0.82, rotate: 58 },
          { t: 1, rotate: 0 },
        ],
      },
    ],
  },
];
