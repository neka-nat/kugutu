import type { SlotKey } from "./slots.js";

export const BEHAVIOR_TYPES = [
  "blink",
  "look-at",
  "breathing",
  "mouth-open",
] as const;

export type BehaviorType = (typeof BEHAVIOR_TYPES)[number];

export interface NumericParamDefinition {
  type: "number" | "integer";
  min: number;
  max: number;
  default: number;
}

export interface BlinkParams {
  closeMs: number;
  openMs: number;
  minIntervalMs: number;
  maxIntervalMs: number;
}

export interface LookAtParams {
  radiusX: number;
  radiusY: number;
  headFollow: number;
  smoothing: number;
}

export interface BreathingParams {
  cycleMs: number;
  amplitudeY: number;
  torsoTiltDeg: number;
}

export interface MouthOpenParams {
  maxOpen: number;
  smoothing: number;
}

export type BehaviorParamsMap = {
  blink: BlinkParams;
  "look-at": LookAtParams;
  breathing: BreathingParams;
  "mouth-open": MouthOpenParams;
};

export type BehaviorAllowedTargetMap = {
  blink: "eye.l" | "eye.r";
  "look-at": "eye.l" | "eye.r" | "pupil.l" | "pupil.r" | "head" | "neck";
  breathing: "torso" | "neck" | "head";
  "mouth-open": "mouth" | "jaw";
};

type BehaviorParamDefinitionsMap = {
  [K in BehaviorType]: {
    [ParamName in keyof BehaviorParamsMap[K]]: NumericParamDefinition;
  };
};

export interface BehaviorSpec<
  TTargets extends SlotKey,
  TParams extends Record<string, NumericParamDefinition>,
> {
  description: string;
  requiredTargets: readonly TTargets[];
  allowedTargets: readonly TTargets[];
  params: TParams;
}

export const BEHAVIOR_SPECS = {
  blink: {
    description: "Auto-generated blink loop for paired eyes.",
    requiredTargets: ["eye.l", "eye.r"],
    allowedTargets: ["eye.l", "eye.r"],
    params: {
      closeMs: { type: "integer", min: 40, max: 300, default: 120 },
      openMs: { type: "integer", min: 40, max: 300, default: 140 },
      minIntervalMs: { type: "integer", min: 800, max: 10000, default: 2500 },
      maxIntervalMs: { type: "integer", min: 800, max: 10000, default: 4500 },
    },
  },
  "look-at": {
    description: "Eyes and optional head follow a target point.",
    requiredTargets: ["eye.l", "eye.r"],
    allowedTargets: ["eye.l", "eye.r", "pupil.l", "pupil.r", "head", "neck"],
    params: {
      radiusX: { type: "number", min: 0, max: 1, default: 0.18 },
      radiusY: { type: "number", min: 0, max: 1, default: 0.12 },
      headFollow: { type: "number", min: 0, max: 1, default: 0.35 },
      smoothing: { type: "number", min: 0, max: 1, default: 0.2 },
    },
  },
  breathing: {
    description: "Subtle torso movement for idle life.",
    requiredTargets: ["torso"],
    allowedTargets: ["torso", "neck", "head"],
    params: {
      cycleMs: { type: "integer", min: 1000, max: 8000, default: 3200 },
      amplitudeY: { type: "number", min: 0, max: 0.3, default: 0.06 },
      torsoTiltDeg: { type: "number", min: -15, max: 15, default: 1.5 },
    },
  },
  "mouth-open": {
    description: "Simple mouth open driver for speech and reactive states.",
    requiredTargets: ["mouth"],
    allowedTargets: ["mouth", "jaw"],
    params: {
      maxOpen: { type: "number", min: 0, max: 1, default: 0.9 },
      smoothing: { type: "number", min: 0, max: 1, default: 0.2 },
    },
  },
} as const satisfies {
  [K in BehaviorType]: BehaviorSpec<
    BehaviorAllowedTargetMap[K],
    BehaviorParamDefinitionsMap[K]
  >;
};

const BEHAVIOR_TYPE_SET = new Set<string>(BEHAVIOR_TYPES);

export function isKnownBehaviorType(type: string): type is BehaviorType {
  return BEHAVIOR_TYPE_SET.has(type);
}
