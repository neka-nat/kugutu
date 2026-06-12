import type { SlotKey } from "./slots.js";

/**
 * A single slot offset within an expression, expressed at intensity = 1.
 * `translateX`/`translateY` are in SVG user units, `rotate` in degrees, and
 * `scaleX`/`scaleY` are fractional deltas applied multiplicatively
 * (`finalScale *= 1 + scale * intensity`).
 */
export interface ExpressionPose {
  slot: SlotKey;
  translateX?: number;
  translateY?: number;
  rotate?: number;
  scaleX?: number;
  scaleY?: number;
}

/** A named static expression preset (happy, sad, …) driven by `setEmotion`. */
export interface CharacterExpression {
  id: string;
  poses: ExpressionPose[];
}

/**
 * Built-in expression library. Compiled into every bundle (authors may override
 * or extend by id) so the runtime carries no hard-coded poses. These match the
 * previously hard-coded `applyEmotion` behavior for backward compatibility.
 */
export const DEFAULT_EXPRESSIONS: CharacterExpression[] = [
  {
    // Lifted outer brows, cheek-raising eye squint, and a wider, slightly open
    // smile — the squint is what really sells a genuine (Duchenne) smile.
    id: "happy",
    poses: [
      { slot: "brow.l", rotate: -5, translateY: -2 },
      { slot: "brow.r", rotate: 5, translateY: -2 },
      { slot: "eye.l", scaleY: -0.46, translateY: 1.5 },
      { slot: "eye.r", scaleY: -0.46, translateY: 1.5 },
      { slot: "mouth", scaleX: 0.18, scaleY: 0.2 },
    ],
  },
  {
    // Inner brows pulled up and together, drooping eyes, head sinking and
    // tilting — the classic dejected read without needing a frown mouth.
    id: "sad",
    poses: [
      { slot: "brow.l", rotate: -14, translateY: 1 },
      { slot: "brow.r", rotate: 14, translateY: 1 },
      { slot: "eye.l", scaleY: -0.16, translateY: 2 },
      { slot: "eye.r", scaleY: -0.16, translateY: 2 },
      { slot: "mouth", scaleX: -0.12, translateY: 1.5 },
      { slot: "head", rotate: 4, translateY: 3 },
    ],
  },
  {
    // Brows driven down and angled into a hard V, eyes narrowed, chin pulled
    // in for a glaring scowl.
    id: "angry",
    poses: [
      { slot: "brow.l", rotate: 17, translateY: 4 },
      { slot: "brow.r", rotate: -17, translateY: 4 },
      { slot: "eye.l", scaleY: -0.12, scaleX: 0.06 },
      { slot: "eye.r", scaleY: -0.12, scaleX: 0.06 },
      { slot: "mouth", scaleX: -0.1, translateY: 0.5 },
      { slot: "head", translateY: 2 },
    ],
  },
  {
    // Brows shoot up, eyes pop wide, mouth rounds open, head recoils slightly.
    id: "surprised",
    poses: [
      { slot: "brow.l", translateY: -7 },
      { slot: "brow.r", translateY: -7 },
      { slot: "eye.l", scaleY: 0.24, scaleX: 0.12 },
      { slot: "eye.r", scaleY: 0.24, scaleX: 0.12 },
      { slot: "mouth", scaleY: 0.55, scaleX: -0.1 },
      { slot: "head", translateY: -1.5 },
    ],
  },
];

export const EXPRESSION_POSE_NUMERIC_KEYS = [
  "translateX",
  "translateY",
  "rotate",
  "scaleX",
  "scaleY",
] as const;

export type ExpressionPoseNumericKey =
  (typeof EXPRESSION_POSE_NUMERIC_KEYS)[number];
