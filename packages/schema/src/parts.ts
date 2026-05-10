export const PART_SLOT_KEYS = [
  "face",
  "hair.front",
  "hair.back",
  "eye",
  "brow",
  "nose",
  "mouth",
  "outfit",
] as const;

export type PartSlotKey = (typeof PART_SLOT_KEYS)[number];

export const PART_EDITABLE_PROPERTIES = [
  "position",
  "scale",
  "rotation",
  "spacing",
  "color",
  "layer",
] as const;

export type PartEditableProperty = (typeof PART_EDITABLE_PROPERTIES)[number];

export interface PartSlotDefinition {
  description: string;
  paired: boolean;
  defaultEditable: readonly PartEditableProperty[];
}

export const PART_SLOT_DEFINITIONS = {
  face: {
    description: "Base face or head shape.",
    paired: false,
    defaultEditable: ["position", "scale", "color", "layer"],
  },
  "hair.front": {
    description: "Front hair layer.",
    paired: false,
    defaultEditable: ["position", "scale", "rotation", "color", "layer"],
  },
  "hair.back": {
    description: "Back hair layer.",
    paired: false,
    defaultEditable: ["position", "scale", "rotation", "color", "layer"],
  },
  eye: {
    description: "Paired eye shape and eye controls.",
    paired: true,
    defaultEditable: ["position", "scale", "rotation", "spacing", "color"],
  },
  brow: {
    description: "Paired brow shape.",
    paired: true,
    defaultEditable: ["position", "scale", "rotation", "spacing", "color"],
  },
  nose: {
    description: "Nose shape.",
    paired: false,
    defaultEditable: ["position", "scale", "rotation", "color"],
  },
  mouth: {
    description: "Mouth shape and speech control.",
    paired: false,
    defaultEditable: ["position", "scale", "rotation", "color"],
  },
  outfit: {
    description: "Upper body outfit variant.",
    paired: false,
    defaultEditable: ["position", "scale", "color", "layer"],
  },
} as const satisfies Record<PartSlotKey, PartSlotDefinition>;

export interface PartTransformNumberDefinition {
  type: "number" | "integer";
  min: number;
  max: number;
}

export const PART_TRANSFORM_NUMBER_DEFINITIONS = {
  x: { type: "number", min: -1000, max: 1000 },
  y: { type: "number", min: -1000, max: 1000 },
  scale: { type: "number", min: 0.01, max: 10 },
  scaleX: { type: "number", min: 0.01, max: 10 },
  scaleY: { type: "number", min: 0.01, max: 10 },
  rotation: { type: "number", min: -360, max: 360 },
  spacing: { type: "number", min: -500, max: 500 },
  layer: { type: "integer", min: -1000, max: 1000 },
} as const satisfies Record<string, PartTransformNumberDefinition>;

export type PartTransformNumberKey =
  keyof typeof PART_TRANSFORM_NUMBER_DEFINITIONS;

const PART_SLOT_KEY_SET = new Set<PartSlotKey>(PART_SLOT_KEYS);
const PART_EDITABLE_PROPERTY_SET = new Set<PartEditableProperty>(
  PART_EDITABLE_PROPERTIES
);

export function isKnownPartSlot(value: string): value is PartSlotKey {
  return PART_SLOT_KEY_SET.has(value as PartSlotKey);
}

export function isKnownPartEditableProperty(
  value: string
): value is PartEditableProperty {
  return PART_EDITABLE_PROPERTY_SET.has(value as PartEditableProperty);
}
