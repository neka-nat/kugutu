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

/** Left/right counterpart for each mirrorable arm slot. */
const MIRROR_SLOT: Partial<Record<SlotKey, SlotKey>> = {
  "upperArm.l": "upperArm.r",
  "upperArm.r": "upperArm.l",
  "forearm.l": "forearm.r",
  "forearm.r": "forearm.l",
  "hand.l": "hand.r",
  "hand.r": "hand.l",
};

/**
 * Mirrors a keyframe across the vertical axis: rotations and horizontal
 * translation flip sign, while vertical translation and scale are unchanged. A
 * left arm is the right arm's geometric mirror, so the same motion authored once
 * on the right reads correctly on the left with these sign flips.
 */
function mirrorKeyframe(frame: GestureKeyframe): GestureKeyframe {
  const mirrored: GestureKeyframe = { t: frame.t };
  if (frame.translateX !== undefined) mirrored.translateX = -frame.translateX;
  if (frame.translateY !== undefined) mirrored.translateY = frame.translateY;
  if (frame.rotate !== undefined) mirrored.rotate = -frame.rotate;
  if (frame.scaleX !== undefined) mirrored.scaleX = frame.scaleX;
  if (frame.scaleY !== undefined) mirrored.scaleY = frame.scaleY;
  return mirrored;
}

function mirrorTrack(track: GestureTrack): GestureTrack {
  return {
    slot: MIRROR_SLOT[track.slot] ?? track.slot,
    keyframes: track.keyframes.map(mirrorKeyframe),
  };
}

/**
 * Adds a mirrored copy of every mirrorable arm track so a gesture authored on
 * one arm plays symmetrically on both. Non-arm tracks (head/torso) are kept as
 * a single shared copy.
 */
function withMirroredArms(tracks: GestureTrack[]): GestureTrack[] {
  const mirrored = tracks
    .filter((track) => MIRROR_SLOT[track.slot] !== undefined)
    .map(mirrorTrack);
  return [...tracks, ...mirrored];
}

/** Right-arm wave tracks, reused (mirrored) for the left-hand variant. */
const WAVE_RIGHT_TRACKS: GestureTrack[] = [
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
];

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
    tracks: WAVE_RIGHT_TRACKS,
  },
  {
    // The left-hand wave. NOT a pure mirror of the right wave: this character's
    // hair is asymmetric (a longer strand falls over the character's left), so a
    // mirrored wave hides the hand behind it. Instead the left arm lifts a touch
    // higher and the forearm wags *outward* (negative = away from the hair) so
    // the hand clears the silhouette and reads clearly. Tuned in headless Chrome.
    id: "wave-left",
    durationMs: 1100,
    tracks: [
      {
        slot: "upperArm.l",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.18, rotate: 84 },
          { t: 0.85, rotate: 84 },
          { t: 1, rotate: 0 },
        ],
      },
      {
        slot: "forearm.l",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.18, rotate: -26 },
          { t: 0.36, rotate: -10 },
          { t: 0.54, rotate: -26 },
          { t: 0.72, rotate: -10 },
          { t: 0.85, rotate: -20 },
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
  {
    // Both arms shoot up and shake in celebration. Authored on the right arm and
    // mirrored, so both raise together. Arm-only (no head/torso track) so it is
    // fully pruned for face-only characters.
    id: "cheer",
    durationMs: 900,
    tracks: withMirroredArms([
      {
        slot: "upperArm.r",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.3, rotate: -84 },
          { t: 0.5, rotate: -74 },
          { t: 0.7, rotate: -84 },
          { t: 0.85, rotate: -74 },
          { t: 1, rotate: 0 },
        ],
      },
      {
        slot: "forearm.r",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.3, rotate: -12 },
          { t: 0.85, rotate: -12 },
          { t: 1, rotate: 0 },
        ],
      },
    ]),
  },
  {
    // A shrug: shoulders lift a touch while the forearms unfold outward
    // (palms-up "who knows?"), held briefly then released. Both arms, mirrored.
    id: "shrug",
    durationMs: 760,
    tracks: withMirroredArms([
      {
        slot: "upperArm.r",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.4, rotate: -16 },
          { t: 0.75, rotate: -16 },
          { t: 1, rotate: 0 },
        ],
      },
      {
        slot: "forearm.r",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.4, rotate: 34 },
          { t: 0.75, rotate: 34 },
          { t: 1, rotate: 0 },
        ],
      },
    ]),
  },
];
