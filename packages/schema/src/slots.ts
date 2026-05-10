export const SLOT_GROUPS = {
  core: "core",
  face: "face",
  neck: "neck",
  body: "body",
  arms: "arms",
} as const;

export type SlotGroup = (typeof SLOT_GROUPS)[keyof typeof SLOT_GROUPS];
export type SlotSide = "left" | "right" | "center";

export interface SlotDefinition {
  group: SlotGroup;
  side: SlotSide;
  description: string;
}

export const SLOT_DEFINITIONS = {
  head: {
    group: SLOT_GROUPS.core,
    side: "center",
    description: "Primary head transform.",
  },
  "eye.l": {
    group: SLOT_GROUPS.face,
    side: "left",
    description: "Left eye lid or eye group.",
  },
  "eye.r": {
    group: SLOT_GROUPS.face,
    side: "right",
    description: "Right eye lid or eye group.",
  },
  "pupil.l": {
    group: SLOT_GROUPS.face,
    side: "left",
    description: "Left pupil or iris control.",
  },
  "pupil.r": {
    group: SLOT_GROUPS.face,
    side: "right",
    description: "Right pupil or iris control.",
  },
  "brow.l": {
    group: SLOT_GROUPS.face,
    side: "left",
    description: "Left brow control.",
  },
  "brow.r": {
    group: SLOT_GROUPS.face,
    side: "right",
    description: "Right brow control.",
  },
  nose: {
    group: SLOT_GROUPS.face,
    side: "center",
    description: "Nose control.",
  },
  mouth: {
    group: SLOT_GROUPS.face,
    side: "center",
    description: "Primary mouth control.",
  },
  "hair.front": {
    group: SLOT_GROUPS.face,
    side: "center",
    description: "Front hair control.",
  },
  "hair.back": {
    group: SLOT_GROUPS.face,
    side: "center",
    description: "Back hair control.",
  },
  jaw: {
    group: SLOT_GROUPS.face,
    side: "center",
    description: "Optional jaw control.",
  },
  neck: {
    group: SLOT_GROUPS.neck,
    side: "center",
    description: "Neck pivot for head follow.",
  },
  torso: {
    group: SLOT_GROUPS.body,
    side: "center",
    description: "Primary torso or chest transform.",
  },
  "upperArm.l": {
    group: SLOT_GROUPS.arms,
    side: "left",
    description: "Left upper arm control.",
  },
  "upperArm.r": {
    group: SLOT_GROUPS.arms,
    side: "right",
    description: "Right upper arm control.",
  },
  "forearm.l": {
    group: SLOT_GROUPS.arms,
    side: "left",
    description: "Left forearm control.",
  },
  "forearm.r": {
    group: SLOT_GROUPS.arms,
    side: "right",
    description: "Right forearm control.",
  },
  "hand.l": {
    group: SLOT_GROUPS.arms,
    side: "left",
    description: "Left hand control.",
  },
  "hand.r": {
    group: SLOT_GROUPS.arms,
    side: "right",
    description: "Right hand control.",
  },
} as const satisfies Record<string, SlotDefinition>;

export type SlotKey = keyof typeof SLOT_DEFINITIONS;

export const SLOT_KEYS = Object.freeze(
  Object.keys(SLOT_DEFINITIONS) as SlotKey[]
) as readonly SlotKey[];

const SLOT_KEY_SET = new Set<SlotKey>(SLOT_KEYS);

export function isKnownSlot(slotKey: string): slotKey is SlotKey {
  return SLOT_KEY_SET.has(slotKey as SlotKey);
}
