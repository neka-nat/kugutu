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
  /**
   * Words/phrases this gesture answers to (any language). Lets an app or agent
   * drive the character by intent — e.g. `playGestureForText("ありがとう")`
   * finds the gesture whose keywords contain it. Matching is case-insensitive.
   */
  keywords?: string[];
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

/** Face-clear right-arm wave tracks, mirrored for wave-left below. */
const WAVE_RIGHT_TRACKS: GestureTrack[] = [
  {
    slot: "upperArm.r",
    keyframes: [
      { t: 0, rotate: 0 },
      { t: 0.18, rotate: -60 },
      { t: 0.85, rotate: -60 },
      { t: 1, rotate: 0 },
    ],
  },
  {
    slot: "forearm.r",
    keyframes: [
      { t: 0, rotate: 0 },
      { t: 0.18, rotate: 94 },
      { t: 0.36, rotate: 82 },
      { t: 0.54, rotate: 94 },
      { t: 0.72, rotate: 82 },
      { t: 0.85, rotate: 88 },
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
    keywords: ["はい", "うん", "そうだね", "yes", "yeah", "うなずく"],
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
    keywords: ["いいえ", "いや", "ちがう", "違う", "no", "nope"],
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
    keywords: ["わーい", "うれしい", "嬉しい", "yay"],
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
    // arm up beside the face, then unfolds the elbow enough to keep the hand
    // outside the face silhouette while the forearm wags side to side.
    id: "wave",
    keywords: [
      "こんにちは", "こんにちわ", "hello", "hi", "やあ", "ハロー", "おはよう", "hey",
      "右手を振る", "右手で手を振る", "wave right",
    ],
    durationMs: 1100,
    tracks: WAVE_RIGHT_TRACKS,
  },
  {
    // Exact mirror of wave, generated from the same source tracks so future
    // tuning cannot make the two sides drift apart.
    id: "wave-left",
    keywords: [
      "バイバイ", "ばいばい", "bye", "またね", "see you", "じゃあね",
      "左手を振る", "左手で手を振る", "wave left",
    ],
    durationMs: 1100,
    tracks: WAVE_RIGHT_TRACKS.map(mirrorTrack),
  },
  {
    // Right arm lifts straight up high beside the face in a clear greeting. The
    // elbow stays nearly open so the forearm and hand clear the face silhouette.
    id: "raise-hand",
    keywords: [
      "挙手", "質問", "はーい", "ここ", "raise", "me",
      "右手を挙げる", "右手を上げる", "右手で挙手", "raise right hand",
    ],
    durationMs: 760,
    tracks: [
      {
        slot: "upperArm.r",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.35, rotate: -76 },
          { t: 0.8, rotate: -76 },
          { t: 1, rotate: 0 },
        ],
      },
      {
        slot: "forearm.r",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.35, rotate: 112 },
          { t: 0.8, rotate: 112 },
          { t: 1, rotate: 0 },
        ],
      },
    ],
  },
  {
    // Left-hand counterpart of raise-hand.
    id: "raise-hand-left",
    keywords: [
      "左手を挙げる", "左手を上げる", "左手で挙手", "raise left hand",
    ],
    durationMs: 760,
    tracks: [
      {
        slot: "upperArm.l",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.35, rotate: 76 },
          { t: 0.8, rotate: 76 },
          { t: 1, rotate: 0 },
        ],
      },
      {
        slot: "forearm.l",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.35, rotate: -112 },
          { t: 0.8, rotate: -112 },
          { t: 1, rotate: 0 },
        ],
      },
    ],
  },
  {
    // Right arm extends up and out, the forearm straightening out of the rest
    // fold (positive delta unfolds the elbow) for a presenting / pointing pose.
    id: "point",
    keywords: [
      "指差し", "指さし", "あれ", "これ", "そこ", "point", "look",
      "右を指す", "右を指して", "右側を指す", "point right",
    ],
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
          { t: 0.4, rotate: 68 },
          { t: 0.82, rotate: 68 },
          { t: 1, rotate: 0 },
        ],
      },
    ],
  },
  {
    // Left-hand counterpart of point.
    id: "point-left",
    keywords: ["左を指す", "左を指して", "左側を指す", "point left"],
    durationMs: 680,
    tracks: [
      {
        slot: "upperArm.l",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.4, rotate: 46 },
          { t: 0.82, rotate: 46 },
          { t: 1, rotate: 0 },
        ],
      },
      {
        slot: "forearm.l",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.4, rotate: -68 },
          { t: 0.82, rotate: -68 },
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
    keywords: ["やったー", "やった", "万歳", "ばんざい", "おめでとう", "cheer", "hooray"],
    durationMs: 900,
    tracks: withMirroredArms([
      {
        slot: "upperArm.r",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.3, rotate: -76 },
          { t: 0.5, rotate: -66 },
          { t: 0.7, rotate: -76 },
          { t: 0.85, rotate: -66 },
          { t: 1, rotate: 0 },
        ],
      },
      {
        slot: "forearm.r",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.3, rotate: 6 },
          { t: 0.85, rotate: 6 },
          { t: 1, rotate: 0 },
        ],
      },
    ]),
  },
  {
    // A shrug: shoulders lift a touch while the forearms unfold outward
    // (palms-up "who knows?"), held briefly then released. Both arms, mirrored.
    id: "shrug",
    keywords: ["さあ", "わからない", "分からない", "しらない", "どうかな", "shrug", "dunno"],
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
  {
    // "了解 / オッケー" — a quick, casual acknowledgment: the right hand pops up
    // beside the head and settles back. Snappier than raise-hand. Arm-only.
    id: "ok",
    keywords: [
      "了解", "オッケー", "おっけー", "OK", "ok", "わかった", "承知", "ラジャー", "gotcha",
      "右手で了解", "右手でオッケー", "右手でOK", "right hand ok", "ok right",
    ],
    durationMs: 640,
    tracks: [
      {
        slot: "upperArm.r",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.3, rotate: -54 },
          { t: 0.7, rotate: -54 },
          { t: 1, rotate: 0 },
        ],
      },
      {
        slot: "forearm.r",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.3, rotate: -4 },
          { t: 0.7, rotate: -4 },
          { t: 1, rotate: 0 },
        ],
      },
    ],
  },
  {
    // Left-hand counterpart of ok.
    id: "ok-left",
    keywords: [
      "左手で了解", "左手でオッケー", "左手でOK", "left hand ok", "ok left",
    ],
    durationMs: 640,
    tracks: [
      {
        slot: "upperArm.l",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.3, rotate: 54 },
          { t: 0.7, rotate: 54 },
          { t: 1, rotate: 0 },
        ],
      },
      {
        slot: "forearm.l",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.3, rotate: 4 },
          { t: 0.7, rotate: 4 },
          { t: 1, rotate: 0 },
        ],
      },
    ],
  },
  {
    // "NG / ダメ" — both forearms swing up to the chest/chin and converge toward
    // the center, then wag in a small "no-no" shake before releasing. (A true
    // crossed-arm batsu X isn't reachable with these short, wide-set arms, so
    // this is the readable stand-in.) Both arms, mirrored. Tuned in Chrome.
    id: "ng",
    keywords: ["NG", "ng", "だめ", "ダメ", "ばつ", "バツ", "×", "✕", "no good", "禁止"],
    durationMs: 860,
    tracks: withMirroredArms([
      {
        slot: "upperArm.r",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.25, rotate: -68 },
          { t: 0.82, rotate: -68 },
          { t: 1, rotate: 0 },
        ],
      },
      {
        slot: "forearm.r",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.25, rotate: -8 },
          { t: 0.45, rotate: -2 },
          { t: 0.62, rotate: -8 },
          { t: 0.8, rotate: -2 },
          { t: 0.9, rotate: -6 },
          { t: 1, rotate: 0 },
        ],
      },
    ]),
  },
  {
    // "ありがとう" — both hands come together toward the center of the chest in a
    // small thankful press, held briefly, then released. Both arms, mirrored.
    id: "thank-you",
    keywords: ["ありがとう", "ありがと", "あざす", "感謝", "thanks", "thank you", "どうも"],
    durationMs: 860,
    tracks: withMirroredArms([
      {
        slot: "upperArm.r",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.35, rotate: -28 },
          { t: 0.72, rotate: -28 },
          { t: 1, rotate: 0 },
        ],
      },
      {
        slot: "forearm.r",
        keyframes: [
          { t: 0, rotate: 0 },
          { t: 0.35, rotate: -10 },
          { t: 0.72, rotate: -10 },
          { t: 1, rotate: 0 },
        ],
      },
    ]),
  },
];
