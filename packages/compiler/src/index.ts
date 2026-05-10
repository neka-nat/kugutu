import {
  CHARBUNDLE_API_METHODS,
  CHARBUNDLE_VERSION,
  CHARPACK_VERSION,
  CHARACTER_SCHEMA_VERSION,
  validateCharacterDefinition,
  type BehaviorType,
  type CharBundle,
  type CharBundleRuntimeApiMethod,
  type CharPack,
  type CharacterBehavior,
  type CharacterDefinition,
  type CharacterPartCatalogItem,
  type CharacterParts,
  type CompiledBehavior,
  type PartSlotKey,
  type PartTransform,
  type SlotBindingMap,
  type SlotKey,
  SLOT_DEFINITIONS,
} from "../../schema/src/index.js";

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
  behaviors: CharacterBehavior[]
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

  return CHARBUNDLE_API_METHODS.filter((method) => api.has(method));
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

function formatSvgNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function mergePartTransform(
  catalogItem: CharacterPartCatalogItem,
  selectionTransform: PartTransform | undefined
): PartTransform {
  return {
    ...(catalogItem.defaults ?? {}),
    ...(selectionTransform ?? {}),
  };
}

function buildNodeTransform(slotKey: SlotKey, transform: PartTransform): string | undefined {
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

interface SvgElementRange {
  start: number;
  end: number;
  tagName: string;
}

function findElementRangeById(svgText: string, nodeId: string): SvgElementRange | undefined {
  const idPattern = escapeRegExp(nodeId);
  const openTagPattern = new RegExp(
    `<([A-Za-z][\\w:.-]*)(?=[^>]*\\bid\\s*=\\s*(["'])${idPattern}\\2)[^>]*>`,
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

    const transform = mergePartTransform(catalogItem, selection.transform);

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
        transform: buildNodeTransform(slotKey, transform),
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
  svgText: string
): string {
  const validation = validateCharacterDefinition(document);
  if (!validation.valid) {
    throw new Error(`Invalid character definition:\n${formatErrors(validation.errors)}`);
  }

  const instructions = collectPartNodeInstructions(document);
  if (instructions.length === 0) {
    return svgText;
  }

  const wrappedSvg = wrapPartNodes(svgText, instructions);
  return insertSvgStyle(
    wrappedSvg,
    mergeSvgStyles([
      buildPartVariantVisibilityStyle(document.parts),
      buildPartColorStyle(instructions),
    ])
  );
}

export function buildCharacterBundle(document: CharacterDefinition): CharBundle {
  const validation = validateCharacterDefinition(document);
  if (!validation.valid) {
    throw new Error(`Invalid character definition:\n${formatErrors(validation.errors)}`);
  }

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
    runtime: {
      api: deriveRuntimeApi(document.behaviors),
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
  options: { includeSource?: boolean } = {}
): CharPack {
  const characterDocument = JSON.parse(JSON.stringify(document)) as CharacterDefinition;
  const composedSvg = composeCharacterSvg(characterDocument, svgText);
  const pack: CharPack = {
    packVersion: CHARPACK_VERSION,
    bundle: buildCharacterBundle(characterDocument),
    assets: [
      {
        id: "primary-svg",
        type: "svg",
        content: composedSvg,
      },
    ],
  };

  if (options.includeSource ?? true) {
    pack.source = characterDocument;
  }

  return pack;
}
