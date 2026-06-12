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
  /**
   * Parent slot in a forward-kinematics joint chain (e.g. `forearm.l` →
   * `upperArm.l`). The runtime composes the chain from this parent link and each
   * joint's `data-kugutu-pivot` marker, so the joints do NOT need to be nested
   * in the SVG DOM — they can live at different z-layers (e.g. the upper arm
   * behind the outfit, the forearm/hand in front) and still bend correctly.
   *
   * Typed as `string` (not `SlotKey`) to avoid a circular type reference with
   * `SLOT_DEFINITIONS`; values are always valid `SlotKey`s.
   */
  parent?: string;
}

/**
 * Attribute marking a joint pivot inside a slot group in the rig SVG. Place an
 * untransformed marker element (e.g. `<circle data-kugutu-pivot cx cy r="0"/>`)
 * as a direct child of the joint group; the runtime reads its center as the
 * rotation origin (shoulder/elbow/wrist) and hides it before rendering.
 */
export const KUGUTU_PIVOT_ATTR = "data-kugutu-pivot";

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
    parent: "upperArm.l",
  },
  "forearm.r": {
    group: SLOT_GROUPS.arms,
    side: "right",
    description: "Right forearm control.",
    parent: "upperArm.r",
  },
  "hand.l": {
    group: SLOT_GROUPS.arms,
    side: "left",
    description: "Left hand control.",
    parent: "forearm.l",
  },
  "hand.r": {
    group: SLOT_GROUPS.arms,
    side: "right",
    description: "Right hand control.",
    parent: "forearm.r",
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

/** Returns the parent slot in the FK joint chain, or undefined for a root slot. */
export function getSlotParent(slotKey: SlotKey): SlotKey | undefined {
  return (SLOT_DEFINITIONS[slotKey] as SlotDefinition).parent as
    | SlotKey
    | undefined;
}

/**
 * Walks the FK joint chain from a slot up to its root (e.g. `hand.r` →
 * `["hand.r", "forearm.r", "upperArm.r"]`). The slot itself is the first entry.
 */
export function getSlotChain(slotKey: SlotKey): SlotKey[] {
  const chain: SlotKey[] = [slotKey];
  let parent = getSlotParent(slotKey);
  while (parent && !chain.includes(parent)) {
    chain.push(parent);
    parent = getSlotParent(parent);
  }
  return chain;
}
