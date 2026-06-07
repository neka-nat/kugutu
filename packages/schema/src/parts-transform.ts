import { SLOT_DEFINITIONS, type SlotKey } from "./slots.js";
import type { PartTransform } from "./types.js";

function formatSvgNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/**
 * Merges a catalog item's default transform with a selection override.
 * Shared by the compiler (build time) and runtime (live `tunePart`) so a part
 * is positioned identically in both places.
 */
export function resolvePartTransform(
  defaults: PartTransform | undefined,
  override: PartTransform | undefined
): PartTransform {
  return {
    ...(defaults ?? {}),
    ...(override ?? {}),
  };
}

/**
 * Builds the SVG `transform` value for a single slot node from a resolved part
 * transform. Paired slots split `spacing` symmetrically based on their side.
 * Returns `undefined` when the transform is an identity (so callers can omit
 * the attribute).
 */
/**
 * Builds the SVG `transform` for an anchor-mounted part fragment (drawn around
 * its own local origin and placed at a slot mount). Unlike
 * {@link composePartNodeTransform}, paired spacing is applied symmetrically as a
 * single `-spacing/2` x-offset: the mirrored right-side mount flips it so both
 * sides move apart together. `paired` is taken from the part slot definition.
 */
export function composeAnchorPartTransform(
  paired: boolean,
  transform: PartTransform
): string | undefined {
  const spacing = transform.spacing ?? 0;
  const x = (transform.x ?? 0) - (paired ? spacing / 2 : 0);
  const y = transform.y ?? 0;
  const rotation = transform.rotation ?? 0;
  const baseScale = transform.scale ?? 1;
  const scaleX = baseScale * (transform.scaleX ?? 1);
  const scaleY = baseScale * (transform.scaleY ?? 1);
  const operations: string[] = [];

  if (x !== 0 || y !== 0) {
    operations.push(`translate(${formatSvgNumber(x)} ${formatSvgNumber(y)})`);
  }

  if (rotation !== 0) {
    operations.push(`rotate(${formatSvgNumber(rotation)})`);
  }

  if (scaleX !== 1 || scaleY !== 1) {
    operations.push(`scale(${formatSvgNumber(scaleX)} ${formatSvgNumber(scaleY)})`);
  }

  return operations.length > 0 ? operations.join(" ") : undefined;
}

export function composePartNodeTransform(
  slotKey: SlotKey,
  transform: PartTransform
): string | undefined {
  const spacing = transform.spacing ?? 0;
  const side = SLOT_DEFINITIONS[slotKey].side;
  const spacingOffset =
    side === "left" ? -spacing / 2 : side === "right" ? spacing / 2 : 0;
  const x = (transform.x ?? 0) + spacingOffset;
  const y = transform.y ?? 0;
  const rotation = transform.rotation ?? 0;
  const baseScale = transform.scale ?? 1;
  const scaleX = baseScale * (transform.scaleX ?? 1);
  const scaleY = baseScale * (transform.scaleY ?? 1);
  const operations: string[] = [];

  if (x !== 0 || y !== 0) {
    operations.push(`translate(${formatSvgNumber(x)} ${formatSvgNumber(y)})`);
  }

  if (rotation !== 0) {
    operations.push(`rotate(${formatSvgNumber(rotation)})`);
  }

  if (scaleX !== 1 || scaleY !== 1) {
    operations.push(`scale(${formatSvgNumber(scaleX)} ${formatSvgNumber(scaleY)})`);
  }

  return operations.length > 0 ? operations.join(" ") : undefined;
}
