import type { BehaviorType } from "./behaviors.js";
import type { SlotKey } from "./slots.js";

export interface TemplateDefinition {
  description: string;
  requiredSlots: readonly SlotKey[];
  optionalSlots: readonly SlotKey[];
  recommendedBehaviors: readonly BehaviorType[];
}

export const TEMPLATES = {
  "avatar-lite": {
    description: "Face plus upper torso. Best for app mascots and assistants.",
    requiredSlots: ["head", "eye.l", "eye.r", "mouth", "torso"],
    optionalSlots: [
      "pupil.l",
      "pupil.r",
      "brow.l",
      "brow.r",
      "nose",
      "hair.front",
      "hair.back",
      "jaw",
      "neck",
    ],
    recommendedBehaviors: ["blink", "look-at", "breathing", "mouth-open"],
  },
  "mascot-upper": {
    description: "Upper-body mascot with simple gestures.",
    requiredSlots: [
      "head",
      "eye.l",
      "eye.r",
      "mouth",
      "torso",
      "upperArm.l",
      "upperArm.r",
      "forearm.l",
      "forearm.r",
      "hand.l",
      "hand.r",
    ],
    optionalSlots: [
      "pupil.l",
      "pupil.r",
      "brow.l",
      "brow.r",
      "nose",
      "hair.front",
      "hair.back",
      "jaw",
      "neck",
    ],
    recommendedBehaviors: [
      "blink",
      "look-at",
      "breathing",
      "mouth-open",
      "arm-idle",
    ],
  },
  "vtuber-lite": {
    description: "Face-first avatar with stronger eye and mouth control.",
    requiredSlots: [
      "head",
      "eye.l",
      "eye.r",
      "pupil.l",
      "pupil.r",
      "brow.l",
      "brow.r",
      "mouth",
    ],
    optionalSlots: ["nose", "hair.front", "hair.back", "jaw", "neck", "torso"],
    recommendedBehaviors: ["blink", "look-at", "mouth-open"],
  },
} as const satisfies Record<string, TemplateDefinition>;

export type TemplateKey = keyof typeof TEMPLATES;

export const TEMPLATE_KEYS = Object.freeze(
  Object.keys(TEMPLATES) as TemplateKey[]
) as readonly TemplateKey[];

const TEMPLATE_KEY_SET = new Set<TemplateKey>(TEMPLATE_KEYS);

export function isKnownTemplate(templateKey: string): templateKey is TemplateKey {
  return TEMPLATE_KEY_SET.has(templateKey as TemplateKey);
}
