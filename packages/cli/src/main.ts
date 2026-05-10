#!/usr/bin/env node

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildCharacterBundle,
  buildCharacterPack,
  composeCharacterSvg,
} from "../../compiler/src/index.js";
import {
  BEHAVIOR_SPECS,
  CHARACTER_SCHEMA_VERSION,
  PART_SLOT_DEFINITIONS,
  PART_TRANSFORM_NUMBER_DEFINITIONS,
  SLOT_DEFINITIONS,
  SLOT_KEYS,
  TEMPLATES,
  isKnownBehaviorType,
  isKnownPartSlot,
  isKnownSlot,
  isKnownTemplate,
  validateCharacterDefinition,
  type BehaviorType,
  type CharacterBehavior,
  type CharacterDefinition,
  type CharacterPartCatalogItem,
  type CharacterParts,
  type PartEditableProperty,
  type PartSlotKey,
  type PartTransform,
  type SlotBindingMap,
  type SlotKey,
  type TemplateKey,
} from "../../schema/src/index.js";

function printUsage(): void {
  console.log(`Usage:
  kugutu init <project-dir> [--template avatar-lite] [--id mascot] [--force]
  kugutu import <source.json> <asset.svg> [--copy]
  kugutu set-slot <source.json> <slot> <node-id>
  kugutu add-part <source.json> <part-id> --slot <part-slot> --asset <asset.svg> [--nodes eye.l=eye_left,eye.r=eye_right] [--display-name "Round Eyes"] [--editable position,scale,spacing,color] [--replace]
  kugutu list-parts <source.json> [--slot <part-slot>]
  kugutu set-part <source.json> <part-slot> <part-id>
  kugutu tune-part <source.json> <part-slot> [--x 0] [--y 0] [--scale 1] [--scale-x 1] [--scale-y 1] [--rotation 0] [--spacing 0] [--color #000] [--layer 0]
  kugutu add-behavior <source.json> <type> [--id blink-default] [--targets eye.l,eye.r] [--replace]
  kugutu compose-svg <source.json> <input.svg> --out <output.svg>
  kugutu pack <source.json> <input.svg> --out <output.charpack> [--no-source]
  kugutu validate <source.json>
  kugutu build <source.json> --out <bundle.json>`);
}

async function readJson(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as unknown;
}

async function readCharacterDefinition(filePath: string): Promise<CharacterDefinition> {
  return (await readJson(filePath)) as CharacterDefinition;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function formatErrors(errors: string[]): string {
  return errors.map((error) => `- ${error}`).join("\n");
}

function parseOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}`);
  }

  return value;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function normalizeIdentifier(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "character";
}

function humanizeIdentifier(value: string): string {
  return value
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join(path.posix.sep);
}

function resolveTemplate(args: string[]): TemplateKey {
  const template = parseOption(args, "--template") ?? "avatar-lite";
  if (!isKnownTemplate(template)) {
    throw new Error(`Unsupported template: ${template}`);
  }

  return template;
}

async function validateCommand(sourcePath: string): Promise<void> {
  const document = await readJson(sourcePath);
  const result = validateCharacterDefinition(document);

  if (!result.valid) {
    console.error(formatErrors(result.errors));
    process.exitCode = 1;
    return;
  }

  console.log(`valid: ${sourcePath}`);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

async function initCommand(projectDir: string, args: string[]): Promise<void> {
  const template = resolveTemplate(args);
  const id = normalizeIdentifier(
    parseOption(args, "--id") ?? path.basename(path.resolve(projectDir))
  );
  const characterPath = path.join(projectDir, "character.json");

  if (!hasFlag(args, "--force") && (await fileExists(characterPath))) {
    throw new Error(`Refusing to overwrite ${characterPath}. Pass --force to replace it.`);
  }

  const document: CharacterDefinition = {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    character: {
      id,
      displayName: humanizeIdentifier(id),
      template,
    },
    assets: {
      primary: "assets/avatar.svg",
    },
    slots: {},
    behaviors: [],
  };

  await mkdir(path.join(projectDir, "assets"), { recursive: true });
  await writeJson(characterPath, document);
  console.log(`created: ${path.resolve(characterPath)}`);
  console.log(`template: ${template} (${TEMPLATES[template].description})`);
}

const SLOT_ID_HINTS: Record<SlotKey, readonly string[]> = {
  head: ["head", "headgroup", "facegroup"],
  "eye.l": ["eyeleft", "lefteye", "eyel"],
  "eye.r": ["eyeright", "righteye", "eyer"],
  "pupil.l": ["pupilleft", "leftpupil", "irleft", "leftiris", "pupill", "irisl"],
  "pupil.r": ["pupilright", "rightpupil", "irright", "rightiris", "pupilr", "irisr"],
  "brow.l": ["browleft", "leftbrow", "eyebrowleft", "lefteyebrow", "browl"],
  "brow.r": ["browright", "rightbrow", "eyebrowright", "righteyebrow", "browr"],
  nose: ["nose"],
  mouth: ["mouth", "mouthgroup", "lip", "lips"],
  "hair.front": ["hairfront", "fronthair", "bang", "bangs"],
  "hair.back": ["hairback", "backhair"],
  jaw: ["jaw", "chin"],
  neck: ["neck"],
  torso: ["torso", "body", "chest"],
  "upperArm.l": ["upperarmleft", "leftupperarm", "armupperleft"],
  "upperArm.r": ["upperarmright", "rightupperarm", "armupperright"],
  "forearm.l": ["forearmleft", "leftforearm", "lowerarmleft"],
  "forearm.r": ["forearmright", "rightforearm", "lowerarmright"],
  "hand.l": ["handleft", "lefthand", "handl"],
  "hand.r": ["handright", "righthand", "handr"],
};

function compactId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function scoreSlotCandidate(slotKey: SlotKey, nodeId: string): number {
  const compact = compactId(nodeId);
  let score = 0;

  for (const hint of SLOT_ID_HINTS[slotKey]) {
    if (compact.includes(hint)) {
      score += 10 + Math.min(hint.length, 8);
    }
  }

  const definition = SLOT_DEFINITIONS[slotKey];
  if (definition.side === "left") {
    if (compact.includes("left")) {
      score += 4;
    }
    if (compact.includes("right")) {
      score -= 12;
    }
  }

  if (definition.side === "right") {
    if (compact.includes("right")) {
      score += 4;
    }
    if (compact.includes("left")) {
      score -= 12;
    }
  }

  if ((slotKey === "eye.l" || slotKey === "eye.r") && /pupil|iris/.test(compact)) {
    score -= 12;
  }

  if ((slotKey === "pupil.l" || slotKey === "pupil.r") && !/pupil|iris/.test(compact)) {
    score -= 6;
  }

  return score;
}

function extractSvgIds(svgText: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const pattern = /\bid\s*=\s*(["'])(.*?)\1/g;

  for (const match of svgText.matchAll(pattern)) {
    const id = match[2];
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }

  return ids;
}

function inferSlotBindings(ids: string[], existingSlots: SlotBindingMap): SlotBindingMap {
  const inferred: SlotBindingMap = {};
  const usedIds = new Set(
    Object.values(existingSlots).filter((value): value is string => typeof value === "string")
  );

  for (const slotKey of SLOT_KEYS) {
    if (existingSlots[slotKey]) {
      continue;
    }

    let bestId: string | undefined;
    let bestScore = 0;

    for (const nodeId of ids) {
      if (usedIds.has(nodeId)) {
        continue;
      }

      const score = scoreSlotCandidate(slotKey, nodeId);
      if (score > bestScore) {
        bestId = nodeId;
        bestScore = score;
      }
    }

    if (bestId && bestScore >= 10) {
      inferred[slotKey] = bestId;
      usedIds.add(bestId);
    }
  }

  return inferred;
}

async function importCommand(sourcePath: string, assetPath: string, args: string[]): Promise<void> {
  const document = await readCharacterDefinition(sourcePath);
  const sourceDir = path.dirname(path.resolve(sourcePath));
  const absoluteAssetPath = path.resolve(assetPath);
  const svgText = await readFile(absoluteAssetPath, "utf8");
  const ids = extractSvgIds(svgText);
  let nextAssetPath = toPosixPath(path.relative(sourceDir, absoluteAssetPath));

  if (hasFlag(args, "--copy")) {
    const targetPath = path.join(sourceDir, "assets", path.basename(assetPath));
    await mkdir(path.dirname(targetPath), { recursive: true });
    if (path.resolve(targetPath) !== absoluteAssetPath) {
      await copyFile(absoluteAssetPath, targetPath);
    }
    nextAssetPath = toPosixPath(path.relative(sourceDir, targetPath));
  }

  const currentSlots = document.slots ?? {};
  const inferredSlots = inferSlotBindings(ids, currentSlots);

  document.assets = {
    primary: nextAssetPath,
  };
  document.slots = {
    ...currentSlots,
    ...inferredSlots,
  };

  await writeJson(sourcePath, document);

  const assigned = Object.keys(inferredSlots).length;
  console.log(`imported: ${nextAssetPath}`);
  console.log(`svg ids: ${ids.length}`);
  console.log(`auto-assigned slots: ${assigned}`);
}

async function setSlotCommand(
  sourcePath: string,
  slotKeyValue: string,
  nodeId: string
): Promise<void> {
  if (!isKnownSlot(slotKeyValue)) {
    throw new Error(`Unsupported slot: ${slotKeyValue}`);
  }

  if (!nodeId.trim()) {
    throw new Error(`node-id must be a non-empty string`);
  }

  const document = await readCharacterDefinition(sourcePath);
  document.slots = {
    ...(document.slots ?? {}),
    [slotKeyValue]: nodeId,
  };

  await writeJson(sourcePath, document);
  console.log(`set: ${slotKeyValue} -> ${nodeId}`);
}

function ensureParts(document: CharacterDefinition): CharacterParts {
  const parts = document.parts ?? {
    catalog: {},
    selections: {},
  };

  document.parts = parts;
  return parts;
}

function parsePartSlot(partSlotValue: string): PartSlotKey {
  if (!isKnownPartSlot(partSlotValue)) {
    throw new Error(`Unsupported part slot: ${partSlotValue}`);
  }

  return partSlotValue;
}

function parseNodeMap(rawNodes: string | undefined): Partial<Record<SlotKey, string>> | undefined {
  if (rawNodes === undefined) {
    return undefined;
  }

  const nodes: Partial<Record<SlotKey, string>> = {};
  const entries = rawNodes
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (entries.length === 0) {
    throw new Error(`--nodes must contain at least one slot=node pair`);
  }

  for (const entry of entries) {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex === -1) {
      throw new Error(`Invalid --nodes entry: ${entry}`);
    }

    const slotKeyValue = entry.slice(0, separatorIndex).trim();
    const nodeId = entry.slice(separatorIndex + 1).trim();

    if (!isKnownSlot(slotKeyValue)) {
      throw new Error(`Unsupported slot in --nodes: ${slotKeyValue}`);
    }

    if (!nodeId) {
      throw new Error(`Node id in --nodes must be non-empty for ${slotKeyValue}`);
    }

    nodes[slotKeyValue] = nodeId;
  }

  return nodes;
}

function parseEditableProperties(
  rawEditable: string | undefined,
  partSlot: PartSlotKey
): PartEditableProperty[] {
  if (rawEditable === undefined) {
    return [...PART_SLOT_DEFINITIONS[partSlot].defaultEditable];
  }

  const properties = rawEditable
    .split(",")
    .map((property) => property.trim())
    .filter(Boolean);

  if (properties.length === 0) {
    throw new Error(`--editable must contain at least one property`);
  }

  const seen = new Set<string>();
  const editable: PartEditableProperty[] = [];
  const allowedEditable = new Set<PartEditableProperty>(
    PART_SLOT_DEFINITIONS[partSlot].defaultEditable
  );

  for (const property of properties) {
    if (!allowedEditable.has(property as PartEditableProperty)) {
      throw new Error(`${property} is not editable for ${partSlot}`);
    }

    if (!seen.has(property)) {
      editable.push(property as PartEditableProperty);
      seen.add(property);
    }
  }

  return editable;
}

function parseOptionalPartTransformUpdates(args: string[]): PartTransform {
  const updates: PartTransform = {};

  const x = parseNumberOption(args, "--x");
  if (x !== undefined) {
    assertTransformNumberInRange("x", x);
    updates.x = x;
  }

  const y = parseNumberOption(args, "--y");
  if (y !== undefined) {
    assertTransformNumberInRange("y", y);
    updates.y = y;
  }

  const scale = parseNumberOption(args, "--scale");
  if (scale !== undefined) {
    assertTransformNumberInRange("scale", scale);
    updates.scale = scale;
  }

  const scaleX = parseNumberOption(args, "--scale-x");
  if (scaleX !== undefined) {
    assertTransformNumberInRange("scaleX", scaleX);
    updates.scaleX = scaleX;
  }

  const scaleY = parseNumberOption(args, "--scale-y");
  if (scaleY !== undefined) {
    assertTransformNumberInRange("scaleY", scaleY);
    updates.scaleY = scaleY;
  }

  const rotation = parseNumberOption(args, "--rotation");
  if (rotation !== undefined) {
    assertTransformNumberInRange("rotation", rotation);
    updates.rotation = rotation;
  }

  const spacing = parseNumberOption(args, "--spacing");
  if (spacing !== undefined) {
    assertTransformNumberInRange("spacing", spacing);
    updates.spacing = spacing;
  }

  const layer = parseIntegerOption(args, "--layer");
  if (layer !== undefined) {
    assertTransformNumberInRange("layer", layer);
    updates.layer = layer;
  }

  const color = parseOption(args, "--color");
  if (color !== undefined) {
    if (!color.trim()) {
      throw new Error(`--color must be a non-empty string`);
    }
    updates.color = color;
  }

  return updates;
}

async function addPartCommand(
  sourcePath: string,
  partId: string,
  args: string[]
): Promise<void> {
  if (!partId.trim()) {
    throw new Error(`part-id must be a non-empty string`);
  }

  const slotOption = parseOption(args, "--slot");
  if (!slotOption) {
    throw new Error(`Missing required --slot <part-slot>`);
  }
  const partSlot = parsePartSlot(slotOption);

  const asset = parseOption(args, "--asset");
  if (!asset) {
    throw new Error(`Missing required --asset <asset.svg>`);
  }

  const document = await readCharacterDefinition(sourcePath);
  const parts = ensureParts(document);

  if (!hasFlag(args, "--replace") && parts.catalog[partId]) {
    throw new Error(`Part already exists: ${partId}. Pass --replace to update it.`);
  }

  const displayName = parseOption(args, "--display-name");
  const nodes = parseNodeMap(parseOption(args, "--nodes"));
  const editable = parseEditableProperties(parseOption(args, "--editable"), partSlot);
  const defaults = parseOptionalPartTransformUpdates(args);
  const item: CharacterPartCatalogItem = {
    id: partId,
    slot: partSlot,
    asset,
    editable,
  };

  if (displayName) {
    item.displayName = displayName;
  }

  if (nodes) {
    item.nodes = nodes;
  }

  if (Object.keys(defaults).length > 0) {
    item.defaults = defaults;
  }

  parts.catalog = {
    ...parts.catalog,
    [partId]: item,
  };

  await writeJson(sourcePath, document);
  console.log(`added part: ${partId} (${partSlot})`);
}

async function listPartsCommand(sourcePath: string, args: string[]): Promise<void> {
  const slotOption = parseOption(args, "--slot");
  const partSlot = slotOption ? parsePartSlot(slotOption) : undefined;
  const document = await readCharacterDefinition(sourcePath);
  const parts = document.parts;

  if (!parts || Object.keys(parts.catalog).length === 0) {
    console.log("No parts catalog entries.");
    return;
  }

  const selectedPartIds = new Set(
    Object.values(parts.selections)
      .filter((selection): selection is NonNullable<typeof selection> => Boolean(selection))
      .map((selection) => selection.partId)
  );
  const entries = Object.values(parts.catalog)
    .filter((item) => !partSlot || item.slot === partSlot)
    .sort((a, b) => a.slot.localeCompare(b.slot) || a.id.localeCompare(b.id));

  if (entries.length === 0) {
    console.log(partSlot ? `No parts for ${partSlot}.` : "No parts catalog entries.");
    return;
  }

  for (const item of entries) {
    const marker = selectedPartIds.has(item.id) ? "*" : "-";
    const label = item.displayName ? ` ${item.displayName}` : "";
    const nodeCount = item.nodes ? Object.keys(item.nodes).length : 0;
    console.log(`${marker} ${item.id} [${item.slot}]${label} asset=${item.asset} nodes=${nodeCount}`);
  }
}

async function setPartCommand(
  sourcePath: string,
  partSlotValue: string,
  partId: string
): Promise<void> {
  const partSlot = parsePartSlot(partSlotValue);

  if (!partId.trim()) {
    throw new Error(`part-id must be a non-empty string`);
  }

  const document = await readCharacterDefinition(sourcePath);
  const parts = ensureParts(document);
  const catalogItem = parts.catalog[partId];

  if (!catalogItem) {
    throw new Error(`Unknown part: ${partId}`);
  }

  if (catalogItem.slot !== partSlot) {
    throw new Error(`${partId} is a ${catalogItem.slot} part, not ${partSlot}`);
  }

  const existingSelection = parts.selections[partSlot];
  const transform = existingSelection?.transform ?? catalogItem.defaults;

  parts.selections = {
    ...parts.selections,
    [partSlot]: transform
      ? { partId, transform: { ...transform } }
      : { partId },
  };

  await writeJson(sourcePath, document);
  console.log(`set: ${partSlot} -> ${partId}`);
}

function parseNumberOption(args: string[], option: string): number | undefined {
  const raw = parseOption(args, option);
  if (raw === undefined) {
    return undefined;
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${option} must be a number`);
  }

  return value;
}

function parseIntegerOption(args: string[], option: string): number | undefined {
  const value = parseNumberOption(args, option);
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isInteger(value)) {
    throw new Error(`${option} must be an integer`);
  }

  return value;
}

function assertTransformNumberInRange(
  field: keyof typeof PART_TRANSFORM_NUMBER_DEFINITIONS,
  value: number
): void {
  const definition = PART_TRANSFORM_NUMBER_DEFINITIONS[field];

  if (value < definition.min || value > definition.max) {
    throw new Error(`--${field} must be between ${definition.min} and ${definition.max}`);
  }
}

function parsePartTransformUpdates(args: string[]): PartTransform {
  const updates = parseOptionalPartTransformUpdates(args);

  if (Object.keys(updates).length === 0) {
    throw new Error(`tune-part requires at least one transform option`);
  }

  return updates;
}

async function tunePartCommand(
  sourcePath: string,
  partSlotValue: string,
  args: string[]
): Promise<void> {
  const partSlot = parsePartSlot(partSlotValue);
  const updates = parsePartTransformUpdates(args);
  const document = await readCharacterDefinition(sourcePath);
  const parts = ensureParts(document);
  const selection = parts.selections[partSlot];

  if (!selection) {
    throw new Error(`${partSlot} has no selected part`);
  }

  parts.selections = {
    ...parts.selections,
    [partSlot]: {
      ...selection,
      transform: {
        ...(selection.transform ?? {}),
        ...updates,
      },
    },
  };

  await writeJson(sourcePath, document);
  console.log(`tuned: ${partSlot}`);
}

function defaultParamsFor(type: BehaviorType): Record<string, number> {
  const params: Record<string, number> = {};

  for (const [name, definition] of Object.entries(BEHAVIOR_SPECS[type].params)) {
    params[name] = definition.default;
  }

  return params;
}

function parseTargetsOption(
  type: BehaviorType,
  slots: SlotBindingMap,
  args: string[]
): CharacterBehavior["targets"] {
  const rawTargets = parseOption(args, "--targets");
  const allowedTargets = new Set<SlotKey>(BEHAVIOR_SPECS[type].allowedTargets);

  if (rawTargets) {
    const targets = rawTargets
      .split(",")
      .map((target) => target.trim())
      .filter(Boolean);

    if (targets.length === 0) {
      throw new Error(`--targets must contain at least one slot`);
    }

    for (const target of targets) {
      if (!isKnownSlot(target)) {
        throw new Error(`Unsupported slot in --targets: ${target}`);
      }

      if (!allowedTargets.has(target)) {
        throw new Error(`${target} is not allowed for ${type}`);
      }

      if (!slots[target]) {
        throw new Error(`${target} has no slot binding`);
      }
    }

    return targets as CharacterBehavior["targets"];
  }

  const missingRequired = BEHAVIOR_SPECS[type].requiredTargets.filter(
    (target) => !slots[target]
  );
  if (missingRequired.length > 0) {
    throw new Error(
      `${type} requires slot bindings: ${missingRequired.join(", ")}`
    );
  }

  return BEHAVIOR_SPECS[type].allowedTargets.filter(
    (target) => Boolean(slots[target])
  ) as CharacterBehavior["targets"];
}

async function addBehaviorCommand(
  sourcePath: string,
  behaviorTypeValue: string,
  args: string[]
): Promise<void> {
  if (!isKnownBehaviorType(behaviorTypeValue)) {
    throw new Error(`Unsupported behavior type: ${behaviorTypeValue}`);
  }

  const document = await readCharacterDefinition(sourcePath);
  const behaviors = Array.isArray(document.behaviors) ? document.behaviors : [];
  const id = parseOption(args, "--id") ?? `${behaviorTypeValue}-default`;

  if (!hasFlag(args, "--replace") && behaviors.some((behavior) => behavior.id === id)) {
    throw new Error(`Behavior already exists: ${id}. Pass --replace to update it.`);
  }

  const behavior: CharacterBehavior = {
    id,
    type: behaviorTypeValue,
    targets: parseTargetsOption(behaviorTypeValue, document.slots ?? {}, args),
    params: defaultParamsFor(behaviorTypeValue),
  };

  document.behaviors = [
    ...behaviors.filter((item) => item.id !== id),
    behavior,
  ];

  await writeJson(sourcePath, document);
  console.log(`added: ${id} (${behaviorTypeValue})`);
}

function parseOutPath(args: string[]): string {
  const outIndex = args.indexOf("--out");
  if (outIndex === -1 || outIndex === args.length - 1) {
    throw new Error(`Missing required --out <bundle.json>`);
  }

  return args[outIndex + 1]!;
}

async function buildCommand(sourcePath: string, args: string[]): Promise<void> {
  const outPath = parseOutPath(args);
  const document = await readCharacterDefinition(sourcePath);
  const bundle = buildCharacterBundle(document);
  const serialized = `${JSON.stringify(bundle, null, 2)}\n`;

  await writeFile(outPath, serialized, "utf8");
  console.log(`built: ${path.resolve(outPath)}`);
}

async function composeSvgCommand(
  sourcePath: string,
  inputSvgPath: string,
  args: string[]
): Promise<void> {
  const outPath = parseOutPath(args);
  const document = await readCharacterDefinition(sourcePath);
  const svgText = await readFile(inputSvgPath, "utf8");
  const composedSvg = composeCharacterSvg(document, svgText);

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, composedSvg, "utf8");
  console.log(`composed: ${path.resolve(outPath)}`);
}

async function packCommand(
  sourcePath: string,
  inputSvgPath: string,
  args: string[]
): Promise<void> {
  const outPath = parseOutPath(args);
  const document = await readCharacterDefinition(sourcePath);
  const svgText = await readFile(inputSvgPath, "utf8");
  const pack = buildCharacterPack(document, svgText, {
    includeSource: !hasFlag(args, "--no-source"),
  });
  const serialized = `${JSON.stringify(pack, null, 2)}\n`;

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, serialized, "utf8");
  console.log(`packed: ${path.resolve(outPath)}`);
}

async function main(argv: string[]): Promise<void> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const [command, ...args] = normalizedArgv;

  if (!command || command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  if (command === "validate") {
    const [sourcePath] = args;
    if (!sourcePath) {
      throw new Error(`Missing source file path`);
    }
    await validateCommand(sourcePath);
    return;
  }

  if (command === "build") {
    const [sourcePath, ...rest] = args;
    if (!sourcePath) {
      throw new Error(`Missing source file path`);
    }
    await buildCommand(sourcePath, rest);
    return;
  }

  if (command === "compose-svg") {
    const [sourcePath, inputSvgPath, ...rest] = args;
    if (!sourcePath || !inputSvgPath) {
      throw new Error(`Usage: kugutu compose-svg <source.json> <input.svg> --out <output.svg>`);
    }
    await composeSvgCommand(sourcePath, inputSvgPath, rest);
    return;
  }

  if (command === "pack") {
    const [sourcePath, inputSvgPath, ...rest] = args;
    if (!sourcePath || !inputSvgPath) {
      throw new Error(`Usage: kugutu pack <source.json> <input.svg> --out <output.charpack>`);
    }
    await packCommand(sourcePath, inputSvgPath, rest);
    return;
  }

  if (command === "init") {
    const [projectDir, ...rest] = args;
    if (!projectDir) {
      throw new Error(`Missing project directory`);
    }
    await initCommand(projectDir, rest);
    return;
  }

  if (command === "import") {
    const [sourcePath, assetPath, ...rest] = args;
    if (!sourcePath || !assetPath) {
      throw new Error(`Usage: kugutu import <source.json> <asset.svg> [--copy]`);
    }
    await importCommand(sourcePath, assetPath, rest);
    return;
  }

  if (command === "set-slot") {
    const [sourcePath, slotKey, nodeId] = args;
    if (!sourcePath || !slotKey || !nodeId) {
      throw new Error(`Usage: kugutu set-slot <source.json> <slot> <node-id>`);
    }
    await setSlotCommand(sourcePath, slotKey, nodeId);
    return;
  }

  if (command === "add-part") {
    const [sourcePath, partId, ...rest] = args;
    if (!sourcePath || !partId) {
      throw new Error(`Usage: kugutu add-part <source.json> <part-id> --slot <part-slot> --asset <asset.svg>`);
    }
    await addPartCommand(sourcePath, partId, rest);
    return;
  }

  if (command === "list-parts") {
    const [sourcePath, ...rest] = args;
    if (!sourcePath) {
      throw new Error(`Usage: kugutu list-parts <source.json> [--slot <part-slot>]`);
    }
    await listPartsCommand(sourcePath, rest);
    return;
  }

  if (command === "set-part") {
    const [sourcePath, partSlot, partId] = args;
    if (!sourcePath || !partSlot || !partId) {
      throw new Error(`Usage: kugutu set-part <source.json> <part-slot> <part-id>`);
    }
    await setPartCommand(sourcePath, partSlot, partId);
    return;
  }

  if (command === "tune-part") {
    const [sourcePath, partSlot, ...rest] = args;
    if (!sourcePath || !partSlot) {
      throw new Error(`Usage: kugutu tune-part <source.json> <part-slot> [options]`);
    }
    await tunePartCommand(sourcePath, partSlot, rest);
    return;
  }

  if (command === "add-behavior") {
    const [sourcePath, behaviorType, ...rest] = args;
    if (!sourcePath || !behaviorType) {
      throw new Error(`Usage: kugutu add-behavior <source.json> <type>`);
    }
    await addBehaviorCommand(sourcePath, behaviorType, rest);
    return;
  }

  throw new Error(`Unsupported command: ${command}`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
