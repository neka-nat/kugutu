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
    id: "happy",
    poses: [
      { slot: "brow.l", rotate: -8 },
      { slot: "brow.r", rotate: 8 },
      { slot: "mouth", scaleY: 0.12 },
    ],
  },
  {
    id: "sad",
    poses: [
      { slot: "brow.l", rotate: 6 },
      { slot: "brow.r", rotate: -6 },
    ],
  },
  {
    id: "angry",
    poses: [
      { slot: "brow.l", rotate: 10 },
      { slot: "brow.r", rotate: -10 },
    ],
  },
  {
    id: "surprised",
    poses: [
      { slot: "brow.l", translateY: -6 },
      { slot: "brow.r", translateY: -6 },
      { slot: "mouth", scaleY: 0.25 },
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
