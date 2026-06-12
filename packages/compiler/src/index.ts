import {
  CHARBUNDLE_API_METHODS,
  CHARBUNDLE_VERSION,
  CHARPACK_VERSION,
  CHARACTER_SCHEMA_VERSION,
  DEFAULT_EXPRESSIONS,
  DEFAULT_GESTURES,
  DEFAULT_VISEMES,
  PART_SLOT_DEFINITIONS,
  composeAnchorPartTransform,
  composePartNodeTransform,
  resolvePartTransform,
  validateCharacterDefinition,
  type BehaviorType,
  type CharBundle,
  type CharBundleRuntimeApiMethod,
  type CharPack,
  type CharacterBehavior,
  type CharacterDefinition,
  type CharacterExpression,
  type CharacterGesture,
  type CharacterPartCatalogItem,
  type CharacterParts,
  type CompiledBehavior,
  type PartSlotKey,
  type PartTransform,
  type SlotBindingMap,
  type SlotKey,
  type VisemeMap,
  SLOT_DEFINITIONS,
  getSlotParent,
} from "@kugutu/schema";

function slotToChannelId(nodeId: string): string {
  return `transform.${nodeId}`;
}

function buildBindings(slots: SlotBindingMap): SlotBindingMap {
  return Object.fromEntries(
    Object.entries(slots).map(([slotKey, nodeId]) => [slotKey, slotToChannelId(nodeId)])
  ) as SlotBindingMap;
}

function compileChannel(
  target: SlotKey,
  slotId: string,
  behaviorType: BehaviorType
): string {
  const baseChannel = slotToChannelId(slotId);

  switch (behaviorType) {
    case "blink":
      return `${baseChannel}.scaleY`;
    case "look-at":
      if (target === "head" || target === "neck") {
        return `${baseChannel}.rotate`;
      }
      return `${baseChannel}.translate`;
    case "breathing":
      if (target === "head") {
        return `${baseChannel}.rotate`;
      }
      return `${baseChannel}.translateY`;
    case "mouth-open":
      return `${baseChannel}.scaleY`;
    case "arm-idle":
      return `${baseChannel}.rotate`;
  }
}

function compileBehavior(
  behavior: CharacterBehavior,
  slots: SlotBindingMap
): CompiledBehavior {
  const compiled: CompiledBehavior = {
    id: behavior.id,
    type: behavior.type,
    channels: behavior.targets.map((target) => {
      const slotId = slots[target];
      if (!slotId) {
        throw new Error(`Missing slot binding for ${target}`);
      }
      return compileChannel(target, slotId, behavior.type);
    }),
  };

  if (behavior.params) {
    compiled.params = behavior.params;
  }

  return compiled;
}

function deriveRuntimeApi(
  behaviors: CharacterBehavior[],
  options: { hasParts: boolean; hasGestures: boolean; hasMouth: boolean }
): CharBundleRuntimeApiMethod[] {
  const api = new Set<CharBundleRuntimeApiMethod>(["playBehavior", "setEmotion"]);

  for (const behavior of behaviors) {
    if (behavior.type === "look-at") {
      api.add("lookAt");
    }

    if (behavior.type === "mouth-open") {
      api.add("setMouthOpen");
    }
  }

  if (options.hasParts) {
    api.add("setPart");
    api.add("setVariant");
    api.add("tunePart");
  }

  if (options.hasGestures) {
    api.add("playGesture");
  }

  if (options.hasMouth) {
    api.add("speak");
  }

  return CHARBUNDLE_API_METHODS.filter((method) => api.has(method));
}

/** Bakes the effective viseme library (defaults overridden by author entries). */
function compileVisemes(document: CharacterDefinition): VisemeMap {
  const merged: VisemeMap = { ...DEFAULT_VISEMES, ...(document.visemes ?? {}) };
  return JSON.parse(JSON.stringify(merged)) as VisemeMap;
}

function mergeById<T extends { id: string }>(
  defaults: readonly T[],
  overrides: readonly T[] | undefined
): T[] {
  const byId = new Map<string, T>();
  for (const item of defaults) {
    byId.set(item.id, item);
  }
  for (const item of overrides ?? []) {
    byId.set(item.id, item);
  }
  return [...byId.values()];
}

/**
 * Bakes the effective expression library into the bundle: built-in defaults
 * overridden/extended by author entries, with poses pruned to slots the
 * character actually binds so the runtime never references a missing slot.
 */
function compileExpressions(document: CharacterDefinition): CharacterExpression[] {
  const slots = document.slots ?? {};
  const result: CharacterExpression[] = [];

  for (const expression of mergeById(DEFAULT_EXPRESSIONS, document.expressions)) {
    const poses = expression.poses.filter((pose) => Boolean(slots[pose.slot]));
    if (poses.length > 0) {
      result.push({ id: expression.id, poses });
    }
  }

  return JSON.parse(JSON.stringify(result)) as CharacterExpression[];
}

/** Same as {@link compileExpressions} but for time-based gestures. */
function compileGestures(document: CharacterDefinition): CharacterGesture[] {
  const slots = document.slots ?? {};
  const result: CharacterGesture[] = [];

  for (const gesture of mergeById(DEFAULT_GESTURES, document.gestures)) {
    const tracks = gesture.tracks.filter((track) => Boolean(slots[track.slot]));
    if (tracks.length > 0) {
      result.push({
        id: gesture.id,
        durationMs: gesture.durationMs,
        ...(gesture.loop !== undefined ? { loop: gesture.loop } : {}),
        tracks,
      });
    }
  }

  return JSON.parse(JSON.stringify(result)) as CharacterGesture[];
}

function cloneParts(parts: CharacterParts | undefined): CharacterParts | undefined {
  if (!parts) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(parts)) as CharacterParts;
}

function formatErrors(errors: string[]): string {
  return errors.map((error) => `- ${error}`).join("\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

interface SvgElementRange {
  start: number;
  end: number;
  tagName: string;
}

function findElementRangeByAttribute(
  svgText: string,
  attrName: string,
  attrValue: string
): SvgElementRange | undefined {
  const namePattern = escapeRegExp(attrName);
  const valuePattern = escapeRegExp(attrValue);
  const openTagPattern = new RegExp(
    `<([A-Za-z][\\w:.-]*)(?=[^>]*\\b${namePattern}\\s*=\\s*(["'])${valuePattern}\\2)[^>]*>`,
    "g"
  );
  const match = openTagPattern.exec(svgText);

  if (!match || match.index === undefined) {
    return undefined;
  }

  const openTag = match[0];
  const tagName = match[1];
  if (!tagName) {
    return undefined;
  }

  const start = match.index;
  const openEnd = start + openTag.length;

  if (/\/\s*>$/.test(openTag)) {
    return { start, end: openEnd, tagName };
  }

  const tagPattern = new RegExp(`</?${escapeRegExp(tagName)}\\b[^>]*>`, "g");
  tagPattern.lastIndex = openEnd;
  let depth = 1;

  for (const tagMatch of svgText.matchAll(tagPattern)) {
    const tag = tagMatch[0];

    if (tag.startsWith("</")) {
      depth -= 1;
    } else if (!/\/\s*>$/.test(tag)) {
      depth += 1;
    }

    if (depth === 0) {
      return {
        start,
        end: tagMatch.index + tag.length,
        tagName,
      };
    }
  }

  return undefined;
}

function findElementRangeById(
  svgText: string,
  nodeId: string
): SvgElementRange | undefined {
  return findElementRangeByAttribute(svgText, "id", nodeId);
}

/** Finds every element whose attribute equals the value (e.g. paired mounts). */
function findAllElementRangesByAttribute(
  svgText: string,
  attrName: string,
  attrValue: string
): SvgElementRange[] {
  const ranges: SvgElementRange[] = [];
  let offset = 0;

  while (offset < svgText.length) {
    const range = findElementRangeByAttribute(
      svgText.slice(offset),
      attrName,
      attrValue
    );
    if (!range) {
      break;
    }

    ranges.push({
      start: range.start + offset,
      end: range.end + offset,
      tagName: range.tagName,
    });
    offset += range.end;
  }

  return ranges;
}

const PART_VARIANT_SLOT_ATTR = "data-kugutu-variant-slot";
const PART_VARIANT_ID_ATTR = "data-kugutu-variant-id";
const PART_SLOT_MOUNT_ATTR = "data-kugutu-slot-mount";

export interface ComposeCharacterSvgOptions {
  /**
   * Map of catalog part id to the SVG fragment that should be injected for that
   * part. When a part has no baked `data-kugutu-variant-*` group in the base
   * SVG, its fragment is mounted into the matching
   * `data-kugutu-slot-mount` element so file-based parts render without hand
   * editing the master SVG.
   */
  partAssets?: Record<string, string>;
}

/** Returns true when a renderable variant group for the part exists in the SVG. */
function hasVariantGroup(svgText: string, partId: string): boolean {
  return (
    findElementRangeByAttribute(svgText, PART_VARIANT_ID_ATTR, partId) !==
    undefined
  );
}

function hasSlotMount(svgText: string, partSlot: PartSlotKey): boolean {
  return (
    findElementRangeByAttribute(svgText, PART_SLOT_MOUNT_ATTR, partSlot) !==
    undefined
  );
}

/**
 * Accepts a part asset as either a raw fragment or a full `<svg>` document and
 * returns the inner markup suitable for nesting inside a variant group.
 */
function extractPartFragment(asset: string): string {
  const match = /<svg\b[^>]*>([\s\S]*)<\/svg\s*>/i.exec(asset);
  return (match?.[1] ?? asset).trim();
}

/** The baked transform/color of a selected anchor part (no `nodes`). */
interface AnchorSelection {
  partSlot: PartSlotKey;
  partId: string;
  transform: string | undefined;
  color: string | undefined;
}

/**
 * Resolves transform/color for selected anchor parts (catalog items with no
 * `nodes`, placed at slot mounts). Keyed by part id since that is how injected
 * variant groups are identified.
 */
function collectAnchorSelections(
  document: CharacterDefinition
): Map<string, AnchorSelection> {
  const byPartId = new Map<string, AnchorSelection>();
  if (!document.parts) {
    return byPartId;
  }

  for (const [partSlotValue, selection] of Object.entries(document.parts.selections)) {
    if (!selection) {
      continue;
    }

    const partSlot = partSlotValue as PartSlotKey;
    const item = document.parts.catalog[selection.partId];
    if (!item || item.nodes) {
      continue;
    }

    const paired = PART_SLOT_DEFINITIONS[partSlot]?.paired ?? false;
    const resolved = resolvePartTransform(item.defaults, selection.transform);
    byPartId.set(selection.partId, {
      partSlot,
      partId: selection.partId,
      transform: composeAnchorPartTransform(paired, resolved),
      color: selection.transform?.color,
    });
  }

  return byPartId;
}

function buildVariantGroup(
  partSlot: PartSlotKey,
  partId: string,
  fragment: string,
  anchor: AnchorSelection | undefined
): string {
  const attributes = [
    `${PART_VARIANT_SLOT_ATTR}="${escapeAttribute(partSlot)}"`,
    `${PART_VARIANT_ID_ATTR}="${escapeAttribute(partId)}"`,
  ];

  if (anchor?.color) {
    attributes.push(`data-kugutu-part-color="${escapeAttribute(partId)}"`);
  }
  if (anchor?.transform) {
    attributes.push(`transform="${escapeAttribute(anchor.transform)}"`);
  }

  return `<g ${attributes.join(" ")}>${fragment}</g>`;
}

function buildAnchorColorStyle(
  anchors: Map<string, AnchorSelection>
): string | undefined {
  const rules: string[] = [];

  for (const selection of anchors.values()) {
    if (!selection.color) {
      continue;
    }

    const selector = `[data-kugutu-part-color="${escapeAttribute(selection.partId)}"]`;
    rules.push(`${selector} [fill]:not([fill="none"]) { fill: ${selection.color}; }`);
    rules.push(`${selector} [stroke]:not([stroke="none"]) { stroke: ${selection.color}; }`);
  }

  return rules.length > 0 ? rules.join("\n") : undefined;
}

interface SvgReplacement {
  start: number;
  end: number;
  text: string;
}

/**
 * Injects part asset fragments (that have no baked variant group) into every
 * matching `data-kugutu-slot-mount` element — paired slots like `eye`/`brow`
 * have two mounts (the right one mirrored), so a single part fragment is placed
 * on both sides. The selected part's transform/color is baked onto its group.
 */
function injectPartAssets(
  svgText: string,
  document: CharacterDefinition,
  partAssets: Record<string, string> | undefined
): string {
  if (!document.parts || !partAssets) {
    return svgText;
  }

  const anchors = collectAnchorSelections(document);
  const groupsBySlot = new Map<PartSlotKey, string[]>();

  for (const [partId, item] of Object.entries(document.parts.catalog)) {
    const fragment = partAssets[partId];
    if (fragment === undefined || hasVariantGroup(svgText, partId)) {
      continue;
    }

    const groups = groupsBySlot.get(item.slot) ?? [];
    groups.push(
      buildVariantGroup(
        item.slot,
        partId,
        extractPartFragment(fragment),
        anchors.get(partId)
      )
    );
    groupsBySlot.set(item.slot, groups);
  }

  if (groupsBySlot.size === 0) {
    return svgText;
  }

  const replacements: SvgReplacement[] = [];

  for (const [partSlot, groups] of groupsBySlot.entries()) {
    const mounts = findAllElementRangesByAttribute(
      svgText,
      PART_SLOT_MOUNT_ATTR,
      partSlot
    );

    if (mounts.length === 0) {
      throw new Error(
        `Cannot inject part asset(s) for "${partSlot}": the base SVG has no <${"g"} ${PART_SLOT_MOUNT_ATTR}="${partSlot}"> mount element.`
      );
    }

    const injected = groups.join("");

    for (const mount of mounts) {
      const element = svgText.slice(mount.start, mount.end);

      if (/\/\s*>$/.test(element)) {
        const openOnly = element.replace(/\/\s*>$/, ">");
        replacements.push({
          start: mount.start,
          end: mount.end,
          text: `${openOnly}${injected}</${mount.tagName}>`,
        });
      } else {
        const closeTag = `</${mount.tagName}>`;
        const insertAt = svgText.lastIndexOf(closeTag, mount.end);
        const position = insertAt === -1 ? mount.end : insertAt;
        replacements.push({ start: position, end: position, text: injected });
      }
    }
  }

  replacements.sort((a, b) => b.start - a.start);

  let output = svgText;
  for (const replacement of replacements) {
    output = `${output.slice(0, replacement.start)}${replacement.text}${output.slice(replacement.end)}`;
  }

  return output;
}

function assertSelectedPartsRenderable(
  svgText: string,
  document: CharacterDefinition
): void {
  if (!document.parts) {
    return;
  }

  const problems: string[] = [];

  for (const [partSlot, selection] of Object.entries(document.parts.selections)) {
    if (!selection) {
      continue;
    }

    if (!hasVariantGroup(svgText, selection.partId)) {
      problems.push(
        `parts.selections.${partSlot} selects "${selection.partId}" but no renderable variant exists (expected a <g ${PART_VARIANT_ID_ATTR}="${selection.partId}"> group in the SVG, or a matching part asset to inject).`
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(`Cannot compose character SVG:\n${formatErrors(problems)}`);
  }
}

interface PartNodeInstruction {
  partSlot: PartSlotKey;
  partId: string;
  slotKey: SlotKey;
  nodeId: string;
  transform: string | undefined;
  color: string | undefined;
}

function collectPartNodeInstructions(
  document: CharacterDefinition
): PartNodeInstruction[] {
  const instructions: PartNodeInstruction[] = [];

  if (!document.parts) {
    return instructions;
  }

  for (const [partSlotValue, selection] of Object.entries(document.parts.selections)) {
    if (!selection) {
      continue;
    }

    const partSlot = partSlotValue as PartSlotKey;
    const catalogItem = document.parts.catalog[selection.partId];
    if (!catalogItem?.nodes) {
      continue;
    }

    const transform = resolvePartTransform(catalogItem.defaults, selection.transform);

    for (const [slotKeyValue, nodeId] of Object.entries(catalogItem.nodes)) {
      if (!nodeId) {
        continue;
      }

      const slotKey = slotKeyValue as SlotKey;
      instructions.push({
        partSlot,
        partId: selection.partId,
        slotKey,
        nodeId,
        transform: composePartNodeTransform(slotKey, transform),
        color: selection.transform?.color,
      });
    }
  }

  return instructions;
}

function wrapPartNodes(svgText: string, instructions: PartNodeInstruction[]): string {
  const ranges = instructions
    .filter(
      (instruction) =>
        instruction.transform !== undefined || instruction.color !== undefined
    )
    .map((instruction) => ({
      instruction,
      range: findElementRangeById(svgText, instruction.nodeId),
    }))
    .filter(
      (item): item is { instruction: PartNodeInstruction; range: SvgElementRange } =>
        item.range !== undefined
    );
  const leafRanges = ranges
    .filter(
      (item) =>
        !ranges.some(
          (other) =>
            other !== item &&
            item.range.start < other.range.start &&
            item.range.end > other.range.end
        )
    )
    .sort((a, b) => b.range.start - a.range.start);

  let output = svgText;

  for (const { instruction, range } of leafRanges) {
    const original = output.slice(range.start, range.end);
    const attributes = [
      `data-kugutu-part-slot="${escapeAttribute(instruction.partSlot)}"`,
      `data-kugutu-part-id="${escapeAttribute(instruction.partId)}"`,
      `data-kugutu-part-node="${escapeAttribute(instruction.nodeId)}"`,
      instruction.color
        ? `data-kugutu-part-color="${escapeAttribute(instruction.nodeId)}"`
        : undefined,
      instruction.transform
        ? `transform="${escapeAttribute(instruction.transform)}"`
        : undefined,
    ].filter((value): value is string => value !== undefined);
    const wrapped = `<g ${attributes.join(" ")}>${original}</g>`;

    output = `${output.slice(0, range.start)}${wrapped}${output.slice(range.end)}`;
  }

  return output;
}

function buildPartColorStyle(instructions: PartNodeInstruction[]): string | undefined {
  const rules: string[] = [];
  const seen = new Set<string>();

  for (const instruction of instructions) {
    if (!instruction.color || seen.has(instruction.nodeId)) {
      continue;
    }

    seen.add(instruction.nodeId);
    const selector = `[data-kugutu-part-color="${escapeAttribute(instruction.nodeId)}"]`;
    rules.push(`${selector} [fill]:not([fill="none"]) { fill: ${instruction.color}; }`);
    rules.push(`${selector} [stroke]:not([stroke="none"]) { stroke: ${instruction.color}; }`);
  }

  if (rules.length === 0) {
    return undefined;
  }

  return rules.join("\n");
}

function buildPartVariantVisibilityStyle(
  parts: CharacterParts | undefined
): string | undefined {
  if (!parts) {
    return undefined;
  }

  const rules: string[] = [];
  const selectedBySlot = new Map<PartSlotKey, string>();

  for (const [slotValue, selection] of Object.entries(parts.selections)) {
    if (!selection) {
      continue;
    }

    selectedBySlot.set(slotValue as PartSlotKey, selection.partId);
  }

  for (const [slot, selectedPartId] of selectedBySlot.entries()) {
    const hasVariants = Object.values(parts.catalog).some(
      (item) => item.slot === slot
    );

    if (!hasVariants) {
      continue;
    }

    const escapedSlot = escapeAttribute(slot);
    const escapedPartId = escapeAttribute(selectedPartId);

    rules.push(
      `[data-kugutu-variant-slot="${escapedSlot}"] { display: none; }`
    );
    rules.push(
      `[data-kugutu-variant-slot="${escapedSlot}"][data-kugutu-variant-id="${escapedPartId}"] { display: inline; }`
    );
  }

  if (rules.length === 0) {
    return undefined;
  }

  return rules.join("\n");
}

function mergeSvgStyles(styles: (string | undefined)[]): string | undefined {
  const rules = styles.filter((style): style is string => style !== undefined);

  if (rules.length === 0) {
    return undefined;
  }

  return `<style id="kugutu-parts-style">\n${rules.join("\n")}\n</style>`;
}

function insertSvgStyle(svgText: string, style: string | undefined): string {
  if (!style) {
    return svgText;
  }

  const match = /<svg\b[^>]*>/i.exec(svgText);
  if (!match || match.index === undefined) {
    return svgText;
  }

  const insertAt = match.index + match[0].length;
  return `${svgText.slice(0, insertAt)}\n  ${style}${svgText.slice(insertAt)}`;
}

export function composeCharacterSvg(
  document: CharacterDefinition,
  svgText: string,
  options: ComposeCharacterSvgOptions = {}
): string {
  const validation = validateCharacterDefinition(document);
  if (!validation.valid) {
    throw new Error(`Invalid character definition:\n${formatErrors(validation.errors)}`);
  }

  const injectedSvg = injectPartAssets(svgText, document, options.partAssets);
  assertSelectedPartsRenderable(injectedSvg, document);

  const instructions = collectPartNodeInstructions(document);
  const wrappedSvg =
    instructions.length > 0 ? wrapPartNodes(injectedSvg, instructions) : injectedSvg;

  return insertSvgStyle(
    wrappedSvg,
    mergeSvgStyles([
      buildPartVariantVisibilityStyle(document.parts),
      buildPartColorStyle(instructions),
      buildAnchorColorStyle(collectAnchorSelections(document)),
    ])
  );
}

export interface CharacterLintResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates a character definition and, when the SVG is available, checks that
 * every selected part can actually render. Catches the common trap where a
 * catalog/CLI-added part is selected but has no SVG representation, which would
 * otherwise silently produce an invisible character.
 */
export function lintCharacter(
  document: CharacterDefinition,
  svgText?: string,
  partAssets?: Record<string, string>
): CharacterLintResult {
  const base = validateCharacterDefinition(document);
  const errors = [...base.errors];
  const warnings: string[] = [];

  // FK joint chains must be complete: a child arm slot rotates relative to its
  // parent, so binding `forearm.*`/`hand.*` without the parent above it leaves
  // the joint pivoting in isolation (no shoulder/elbow follow-through).
  if (base.valid) {
    for (const slotKey of Object.keys(document.slots ?? {}) as SlotKey[]) {
      const parent = getSlotParent(slotKey);
      if (parent && !document.slots?.[parent]) {
        warnings.push(
          `slots.${slotKey} is bound but its FK parent slots.${parent} is not; the joint will not follow its parent. Bind ${parent} for a connected arm.`
        );
      }
    }
  }

  if (svgText !== undefined && base.valid && document.parts) {
    const renderable = (partId: string, partSlot: PartSlotKey): boolean =>
      hasVariantGroup(svgText, partId) ||
      (partAssets?.[partId] !== undefined && hasSlotMount(svgText, partSlot));

    for (const [partSlot, selection] of Object.entries(document.parts.selections)) {
      if (!selection) {
        continue;
      }

      if (!renderable(selection.partId, partSlot as PartSlotKey)) {
        errors.push(
          `parts.selections.${partSlot} selects "${selection.partId}" but it has no renderable SVG (no <g ${PART_VARIANT_ID_ATTR}="${selection.partId}"> group and no mountable part asset).`
        );
      }
    }

    for (const [partId, item] of Object.entries(document.parts.catalog)) {
      if (hasVariantGroup(svgText, partId)) {
        continue;
      }

      if (partAssets?.[partId] === undefined) {
        warnings.push(
          `parts.catalog.${partId} has no SVG variant group and no part asset on disk; selecting it would render nothing.`
        );
      } else if (!hasSlotMount(svgText, item.slot)) {
        warnings.push(
          `parts.catalog.${partId} has an asset but the SVG has no <g ${PART_SLOT_MOUNT_ATTR}="${item.slot}"> mount to inject it into.`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function buildCharacterBundle(document: CharacterDefinition): CharBundle {
  const validation = validateCharacterDefinition(document);
  if (!validation.valid) {
    throw new Error(`Invalid character definition:\n${formatErrors(validation.errors)}`);
  }

  const expressions = compileExpressions(document);
  const gestures = compileGestures(document);
  const visemes = compileVisemes(document);
  const hasParts = Object.keys(document.parts?.catalog ?? {}).length > 0;
  const hasMouth = Boolean(document.slots?.mouth);

  const bundle: CharBundle = {
    bundleVersion: CHARBUNDLE_VERSION,
    sourceSchemaVersion: CHARACTER_SCHEMA_VERSION,
    character: {
      id: document.character.id,
      template: document.character.template,
    },
    assets: [
      {
        id: "primary-svg",
        type: "svg",
        path: document.assets.primary,
      },
    ],
    bindings: {
      slots: buildBindings(document.slots),
    },
    behaviors: document.behaviors.map((behavior) =>
      compileBehavior(behavior, document.slots)
    ),
    expressions,
    gestures,
    visemes,
    runtime: {
      api: deriveRuntimeApi(document.behaviors, {
        hasParts,
        hasGestures: gestures.length > 0,
        hasMouth,
      }),
    },
  };

  const parts = cloneParts(document.parts);
  if (parts) {
    bundle.parts = parts;
  }

  return bundle;
}

export function buildCharacterPack(
  document: CharacterDefinition,
  svgText: string,
  options: { includeSource?: boolean; partAssets?: Record<string, string> } = {}
): CharPack {
  const characterDocument = JSON.parse(JSON.stringify(document)) as CharacterDefinition;
  const composedSvg = composeCharacterSvg(characterDocument, svgText, {
    ...(options.partAssets ? { partAssets: options.partAssets } : {}),
  });
  const pack: CharPack = {
    packVersion: CHARPACK_VERSION,
    bundle: buildCharacterBundle(characterDocument),
    assets: [
      {
        id: "primary-svg",
        type: "svg",
        content: composedSvg,
      },
      {
        id: "source-svg",
        type: "svg",
        content: svgText,
      },
    ],
  };

  if (options.includeSource ?? true) {
    pack.source = characterDocument;
  }

  if (options.partAssets && Object.keys(options.partAssets).length > 0) {
    pack.partAssets = { ...options.partAssets };
  }

  return pack;
}
