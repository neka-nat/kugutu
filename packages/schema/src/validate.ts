import {
  BEHAVIOR_SPECS,
  isKnownBehaviorType,
  type BlinkParams,
  type BehaviorSpec,
  type NumericParamDefinition,
} from "./behaviors.js";
import {
  CHARBUNDLE_API_METHODS,
  CHARBUNDLE_ASSET_TYPES,
  CHARBUNDLE_VERSION,
  CHARACTER_SCHEMA_VERSION,
} from "./bundle.js";
import { EXPRESSION_POSE_NUMERIC_KEYS } from "./expressions.js";
import {
  PART_TRANSFORM_NUMBER_DEFINITIONS,
  isKnownPartEditableProperty,
  isKnownPartSlot,
  type PartSlotKey,
  type PartTransformNumberDefinition,
  type PartTransformNumberKey,
} from "./parts.js";
import { isKnownSlot, type SlotKey } from "./slots.js";
import { TEMPLATES, isKnownTemplate, type TemplateDefinition, type TemplateKey } from "./templates.js";
import type {
  CharacterBehavior,
  CharacterPartCatalogItem,
  CharacterPartSelection,
  CharacterParts,
  PartTransform,
  SlotBindingMap,
  ValidationResult,
} from "./types.js";

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateIdentifier(value: unknown, path: string, errors: string[]): void {
  if (!isNonEmptyString(value) || !ID_PATTERN.test(value)) {
    errors.push(`${path} must be a kebab-case identifier`);
  }
}

function validateNumber(
  value: unknown,
  definition: NumericParamDefinition,
  path: string,
  errors: string[]
): void {
  if (typeof value !== "number" || Number.isNaN(value)) {
    errors.push(`${path} must be a number`);
    return;
  }

  if (definition.type === "integer" && !Number.isInteger(value)) {
    errors.push(`${path} must be an integer`);
  }

  if (value < definition.min || value > definition.max) {
    errors.push(`${path} must be between ${definition.min} and ${definition.max}`);
  }
}

function validateBehaviorParams(
  behavior: CharacterBehavior,
  spec: BehaviorSpec<SlotKey, Record<string, NumericParamDefinition>>,
  path: string,
  errors: string[]
): void {
  if (behavior.params === undefined) {
    return;
  }

  if (!isPlainObject(behavior.params)) {
    errors.push(`${path}.params must be an object`);
    return;
  }

  for (const [name, value] of Object.entries(behavior.params as Record<string, unknown>)) {
    const definition = spec.params[name];
    if (!definition) {
      errors.push(`${path}.params.${name} is not supported by ${behavior.type}`);
      continue;
    }

    validateNumber(value, definition, `${path}.params.${name}`, errors);
  }

  if (
    behavior.type === "blink" &&
    typeof (behavior.params as Partial<BlinkParams>).minIntervalMs === "number" &&
    typeof (behavior.params as Partial<BlinkParams>).maxIntervalMs === "number" &&
    (behavior.params as Partial<BlinkParams>).maxIntervalMs! <
      (behavior.params as Partial<BlinkParams>).minIntervalMs!
  ) {
    errors.push(`${path}.params.maxIntervalMs must be greater than or equal to minIntervalMs`);
  }
}

function validatePartTransformNumber(
  value: unknown,
  definition: PartTransformNumberDefinition,
  path: string,
  errors: string[]
): void {
  if (typeof value !== "number" || Number.isNaN(value)) {
    errors.push(`${path} must be a number`);
    return;
  }

  if (definition.type === "integer" && !Number.isInteger(value)) {
    errors.push(`${path} must be an integer`);
  }

  if (value < definition.min || value > definition.max) {
    errors.push(`${path} must be between ${definition.min} and ${definition.max}`);
  }
}

function validatePartTransform(
  transformValue: unknown,
  path: string,
  errors: string[]
): transformValue is PartTransform {
  if (!isPlainObject(transformValue)) {
    errors.push(`${path} must be an object`);
    return false;
  }

  for (const [name, value] of Object.entries(transformValue)) {
    const definition =
      PART_TRANSFORM_NUMBER_DEFINITIONS[name as PartTransformNumberKey];

    if (definition) {
      validatePartTransformNumber(value, definition, `${path}.${name}`, errors);
      continue;
    }

    if (name === "color") {
      if (!isNonEmptyString(value)) {
        errors.push(`${path}.color must be a non-empty string`);
      }
      continue;
    }

    errors.push(`${path}.${name} is not a supported part transform property`);
  }

  return true;
}

function validatePartCatalogItem(
  itemValue: unknown,
  partId: string,
  path: string,
  errors: string[]
): CharacterPartCatalogItem | undefined {
  if (!isPlainObject(itemValue)) {
    errors.push(`${path} must be an object`);
    return undefined;
  }

  const item = itemValue as unknown as CharacterPartCatalogItem;

  validateIdentifier(item.id, `${path}.id`, errors);

  if (item.id !== partId) {
    errors.push(`${path}.id must match its catalog key`);
  }

  if (!isKnownPartSlot(String(item.slot))) {
    errors.push(`${path}.slot must be a supported part slot`);
  }

  if (
    item.displayName !== undefined &&
    !isNonEmptyString(item.displayName)
  ) {
    errors.push(`${path}.displayName must be a non-empty string`);
  }

  if (!isNonEmptyString(item.asset)) {
    errors.push(`${path}.asset must be a non-empty string`);
  }

  if (item.nodes !== undefined) {
    if (!isPlainObject(item.nodes)) {
      errors.push(`${path}.nodes must be an object`);
    } else {
      for (const [slotKey, nodeId] of Object.entries(item.nodes)) {
        if (!isKnownSlot(slotKey)) {
          errors.push(`${path}.nodes.${slotKey} is not a supported slot key`);
        }

        if (!isNonEmptyString(nodeId)) {
          errors.push(`${path}.nodes.${slotKey} must be a non-empty string`);
        }
      }
    }
  }

  if (item.editable !== undefined) {
    if (!Array.isArray(item.editable)) {
      errors.push(`${path}.editable must be an array`);
    } else {
      const seen = new Set<string>();

      for (let index = 0; index < item.editable.length; index += 1) {
        const property = item.editable[index];
        const propertyPath = `${path}.editable[${index}]`;

        if (!isNonEmptyString(property)) {
          errors.push(`${propertyPath} must be a string`);
          continue;
        }

        if (!isKnownPartEditableProperty(property)) {
          errors.push(`${propertyPath} is not a supported editable property`);
        }

        if (seen.has(property)) {
          errors.push(`${propertyPath} must not be duplicated`);
        }
        seen.add(property);
      }
    }
  }

  if (item.defaults !== undefined) {
    validatePartTransform(item.defaults, `${path}.defaults`, errors);
  }

  return item;
}

function validatePartSelection(
  selectionValue: unknown,
  partSlot: PartSlotKey,
  catalog: Record<string, CharacterPartCatalogItem>,
  path: string,
  errors: string[]
): void {
  if (!isPlainObject(selectionValue)) {
    errors.push(`${path} must be an object`);
    return;
  }

  const selection = selectionValue as unknown as CharacterPartSelection;

  validateIdentifier(selection.partId, `${path}.partId`, errors);

  const catalogItem = catalog[selection.partId];
  if (!catalogItem) {
    errors.push(`${path}.partId must reference parts.catalog.${selection.partId}`);
  } else if (catalogItem.slot !== partSlot) {
    errors.push(`${path}.partId must reference a ${partSlot} part`);
  }

  if (selection.transform !== undefined) {
    validatePartTransform(selection.transform, `${path}.transform`, errors);
  }
}

function validateParts(partsValue: unknown, path: string, errors: string[]): void {
  if (!isPlainObject(partsValue)) {
    errors.push(`${path} must be an object`);
    return;
  }

  const parts = partsValue as unknown as CharacterParts;
  const catalog: Record<string, CharacterPartCatalogItem> = {};

  if (!isPlainObject(parts.catalog)) {
    errors.push(`${path}.catalog must be an object`);
  } else {
    for (const [partId, itemValue] of Object.entries(parts.catalog)) {
      validateIdentifier(partId, `${path}.catalog.${partId}`, errors);
      const item = validatePartCatalogItem(
        itemValue,
        partId,
        `${path}.catalog.${partId}`,
        errors
      );

      if (item && isKnownPartSlot(String(item.slot))) {
        catalog[partId] = item;
      }
    }
  }

  if (!isPlainObject(parts.selections)) {
    errors.push(`${path}.selections must be an object`);
  } else {
    for (const [slotKey, selectionValue] of Object.entries(parts.selections)) {
      if (!isKnownPartSlot(slotKey)) {
        errors.push(`${path}.selections.${slotKey} is not a supported part slot`);
        continue;
      }

      validatePartSelection(
        selectionValue,
        slotKey,
        catalog,
        `${path}.selections.${slotKey}`,
        errors
      );
    }
  }
}

function validateFiniteNumber(
  value: unknown,
  path: string,
  errors: string[]
): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${path} must be a finite number`);
  }
}

const EXPRESSION_NUMERIC_KEY_SET = new Set<string>(EXPRESSION_POSE_NUMERIC_KEYS);

function validateOffsetKeys(
  value: Record<string, unknown>,
  reservedKeys: readonly string[],
  path: string,
  errors: string[]
): void {
  for (const [key, raw] of Object.entries(value)) {
    if (reservedKeys.includes(key)) {
      continue;
    }

    if (!EXPRESSION_NUMERIC_KEY_SET.has(key)) {
      errors.push(`${path}.${key} is not a supported offset property`);
      continue;
    }

    validateFiniteNumber(raw, `${path}.${key}`, errors);
  }
}

function validateExpressionPose(
  value: unknown,
  path: string,
  errors: string[]
): void {
  if (!isPlainObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }

  if (!isKnownSlot(String(value.slot))) {
    errors.push(`${path}.slot must be a supported slot key`);
  }

  validateOffsetKeys(value, ["slot"], path, errors);
}

function validateExpression(value: unknown, path: string, errors: string[]): void {
  if (!isPlainObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }

  validateIdentifier(value.id, `${path}.id`, errors);

  if (!Array.isArray(value.poses) || value.poses.length === 0) {
    errors.push(`${path}.poses must be a non-empty array`);
    return;
  }

  for (let index = 0; index < value.poses.length; index += 1) {
    validateExpressionPose(value.poses[index], `${path}.poses[${index}]`, errors);
  }
}

function validateExpressions(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return;
  }

  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const expression = value[index];
    validateExpression(expression, `${path}[${index}]`, errors);

    if (isPlainObject(expression) && typeof expression.id === "string") {
      if (seen.has(expression.id)) {
        errors.push(`${path}[${index}].id "${expression.id}" is duplicated`);
      }
      seen.add(expression.id);
    }
  }
}

function validateGestureKeyframe(
  value: unknown,
  path: string,
  errors: string[]
): void {
  if (!isPlainObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }

  if (typeof value.t !== "number" || !Number.isFinite(value.t) || value.t < 0 || value.t > 1) {
    errors.push(`${path}.t must be a number between 0 and 1`);
  }

  validateOffsetKeys(value, ["t"], path, errors);
}

function validateGestureTrack(
  value: unknown,
  path: string,
  errors: string[]
): void {
  if (!isPlainObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }

  if (!isKnownSlot(String(value.slot))) {
    errors.push(`${path}.slot must be a supported slot key`);
  }

  if (!Array.isArray(value.keyframes) || value.keyframes.length === 0) {
    errors.push(`${path}.keyframes must be a non-empty array`);
    return;
  }

  for (let index = 0; index < value.keyframes.length; index += 1) {
    validateGestureKeyframe(value.keyframes[index], `${path}.keyframes[${index}]`, errors);
  }
}

function validateGesture(value: unknown, path: string, errors: string[]): void {
  if (!isPlainObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }

  validateIdentifier(value.id, `${path}.id`, errors);

  if (typeof value.durationMs !== "number" || !Number.isFinite(value.durationMs) || value.durationMs <= 0) {
    errors.push(`${path}.durationMs must be a positive number`);
  }

  if (value.loop !== undefined && typeof value.loop !== "boolean") {
    errors.push(`${path}.loop must be a boolean`);
  }

  if (!Array.isArray(value.tracks) || value.tracks.length === 0) {
    errors.push(`${path}.tracks must be a non-empty array`);
    return;
  }

  for (let index = 0; index < value.tracks.length; index += 1) {
    validateGestureTrack(value.tracks[index], `${path}.tracks[${index}]`, errors);
  }
}

function validateGestures(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return;
  }

  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const gesture = value[index];
    validateGesture(gesture, `${path}[${index}]`, errors);

    if (isPlainObject(gesture) && typeof gesture.id === "string") {
      if (seen.has(gesture.id)) {
        errors.push(`${path}[${index}].id "${gesture.id}" is duplicated`);
      }
      seen.add(gesture.id);
    }
  }
}

function validateViseme(value: unknown, path: string, errors: string[]): void {
  if (!isPlainObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }

  if (
    typeof value.open !== "number" ||
    !Number.isFinite(value.open) ||
    value.open < 0 ||
    value.open > 1
  ) {
    errors.push(`${path}.open must be a number between 0 and 1`);
  }

  if (
    value.width !== undefined &&
    (typeof value.width !== "number" || !Number.isFinite(value.width) || value.width <= 0)
  ) {
    errors.push(`${path}.width must be a positive number`);
  }

  for (const key of Object.keys(value)) {
    if (key !== "open" && key !== "width") {
      errors.push(`${path}.${key} is not a supported viseme property`);
    }
  }
}

function validateVisemes(value: unknown, path: string, errors: string[]): void {
  if (!isPlainObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }

  for (const [id, pose] of Object.entries(value)) {
    if (!isNonEmptyString(id)) {
      errors.push(`${path} keys must be non-empty viseme ids`);
      continue;
    }

    validateViseme(pose, `${path}.${id}`, errors);
  }
}

function validateBehavior(
  behaviorValue: unknown,
  slotMap: SlotBindingMap,
  path: string,
  errors: string[]
): void {
  if (!isPlainObject(behaviorValue)) {
    errors.push(`${path} must be an object`);
    return;
  }

  const behavior = behaviorValue as unknown as CharacterBehavior;

  validateIdentifier(behavior.id, `${path}.id`, errors);

  if (!isKnownBehaviorType(behavior.type)) {
    errors.push(`${path}.type must be one of the supported behavior types`);
    return;
  }

  const spec = BEHAVIOR_SPECS[behavior.type] as BehaviorSpec<
    SlotKey,
    Record<string, NumericParamDefinition>
  >;

  if (!Array.isArray(behavior.targets) || behavior.targets.length === 0) {
    errors.push(`${path}.targets must be a non-empty array`);
  } else {
    const targetSet = new Set<string>();

    for (let index = 0; index < behavior.targets.length; index += 1) {
      const target = behavior.targets[index];
      const targetPath = `${path}.targets[${index}]`;

      if (!isNonEmptyString(target)) {
        errors.push(`${targetPath} must be a string`);
        continue;
      }

      if (targetSet.has(target)) {
        errors.push(`${targetPath} must not be duplicated`);
      }
      targetSet.add(target);

      if (!spec.allowedTargets.includes(target as SlotKey)) {
        errors.push(`${targetPath} is not allowed for ${behavior.type}`);
      }

      if (!slotMap[target as SlotKey]) {
        errors.push(`${targetPath} references an undefined slot`);
      }
    }

    for (const requiredTarget of spec.requiredTargets) {
      if (!targetSet.has(requiredTarget)) {
        errors.push(`${path}.targets must include ${requiredTarget}`);
      }
    }
  }

  validateBehaviorParams(behavior, spec, path, errors);
}

function validateSlots(
  slots: unknown,
  template: TemplateDefinition,
  templateKey: TemplateKey,
  errors: string[]
): slots is SlotBindingMap {
  if (!isPlainObject(slots)) {
    errors.push(`slots must be an object`);
    return false;
  }

  for (const [slotKey, nodeId] of Object.entries(slots)) {
    if (!isKnownSlot(slotKey)) {
      errors.push(`slots.${slotKey} is not a supported slot key`);
      continue;
    }

    if (!isNonEmptyString(nodeId)) {
      errors.push(`slots.${slotKey} must be a non-empty string`);
    }
  }

  const slotMap = slots as SlotBindingMap;

  for (const requiredSlot of template.requiredSlots) {
    if (!slotMap[requiredSlot]) {
      errors.push(`slots.${requiredSlot} is required for template ${templateKey}`);
    }
  }

  return true;
}

export function validateCharacterDefinition(document: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isPlainObject(document)) {
    return { valid: false, errors: ["document must be an object"] };
  }

  if (document.schemaVersion !== CHARACTER_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${CHARACTER_SCHEMA_VERSION}`);
  }

  if (!isPlainObject(document.character)) {
    errors.push(`character must be an object`);
  } else {
    validateIdentifier(document.character.id, `character.id`, errors);

    if (
      document.character.displayName !== undefined &&
      !isNonEmptyString(document.character.displayName)
    ) {
      errors.push(`character.displayName must be a non-empty string`);
    }

    if (!isKnownTemplate(String(document.character.template))) {
      errors.push(`character.template must be a supported template`);
    }
  }

  if (!isPlainObject(document.assets) || !isNonEmptyString(document.assets.primary)) {
    errors.push(`assets.primary must be a non-empty string`);
  }

  if (document.parts !== undefined) {
    validateParts(document.parts, "parts", errors);
  }

  if (document.expressions !== undefined) {
    validateExpressions(document.expressions, "expressions", errors);
  }

  if (document.gestures !== undefined) {
    validateGestures(document.gestures, "gestures", errors);
  }

  if (document.visemes !== undefined) {
    validateVisemes(document.visemes, "visemes", errors);
  }

  let hasValidSlots = false;

  if (
    isPlainObject(document.character) &&
    isKnownTemplate(String(document.character.template))
  ) {
    const templateKey = document.character.template as TemplateKey;
    const template = TEMPLATES[templateKey];
    hasValidSlots = validateSlots(document.slots, template, templateKey, errors);
  } else if (isPlainObject(document.slots)) {
    hasValidSlots = true;
  } else {
    errors.push(`slots must be an object`);
  }

  if (!Array.isArray(document.behaviors)) {
    errors.push(`behaviors must be an array`);
  } else if (hasValidSlots) {
    for (let index = 0; index < document.behaviors.length; index += 1) {
      validateBehavior(document.behaviors[index], document.slots as SlotBindingMap, `behaviors[${index}]`, errors);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateCharBundle(bundle: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isPlainObject(bundle)) {
    return { valid: false, errors: ["bundle must be an object"] };
  }

  if (bundle.bundleVersion !== CHARBUNDLE_VERSION) {
    errors.push(`bundleVersion must be ${CHARBUNDLE_VERSION}`);
  }

  if (bundle.sourceSchemaVersion !== CHARACTER_SCHEMA_VERSION) {
    errors.push(`sourceSchemaVersion must be ${CHARACTER_SCHEMA_VERSION}`);
  }

  if (!isPlainObject(bundle.character)) {
    errors.push(`character must be an object`);
  } else {
    validateIdentifier(bundle.character.id, `character.id`, errors);

    if (!isKnownTemplate(String(bundle.character.template))) {
      errors.push(`character.template must be a supported template`);
    }
  }

  if (!Array.isArray(bundle.assets) || bundle.assets.length === 0) {
    errors.push(`assets must be a non-empty array`);
  } else {
    for (let index = 0; index < bundle.assets.length; index += 1) {
      const asset = bundle.assets[index];
      const assetPath = `assets[${index}]`;

      if (!isPlainObject(asset)) {
        errors.push(`${assetPath} must be an object`);
        continue;
      }

      validateIdentifier(asset.id, `${assetPath}.id`, errors);

      if (!CHARBUNDLE_ASSET_TYPES.includes(asset.type as "svg")) {
        errors.push(`${assetPath}.type must be a supported asset type`);
      }

      if (!isNonEmptyString(asset.path)) {
        errors.push(`${assetPath}.path must be a non-empty string`);
      }
    }
  }

  if (!isPlainObject(bundle.bindings) || !isPlainObject(bundle.bindings.slots)) {
    errors.push(`bindings.slots must be an object`);
  } else {
    for (const [slotKey, channelId] of Object.entries(bundle.bindings.slots)) {
      if (!isKnownSlot(slotKey)) {
        errors.push(`bindings.slots.${slotKey} is not a supported slot`);
      }

      if (!isNonEmptyString(channelId)) {
        errors.push(`bindings.slots.${slotKey} must be a non-empty string`);
      }
    }
  }

  if (bundle.parts !== undefined) {
    validateParts(bundle.parts, "parts", errors);
  }

  if (bundle.expressions !== undefined) {
    validateExpressions(bundle.expressions, "expressions", errors);
  }

  if (bundle.gestures !== undefined) {
    validateGestures(bundle.gestures, "gestures", errors);
  }

  if (bundle.visemes !== undefined) {
    validateVisemes(bundle.visemes, "visemes", errors);
  }

  if (!Array.isArray(bundle.behaviors)) {
    errors.push(`behaviors must be an array`);
  } else {
    for (let index = 0; index < bundle.behaviors.length; index += 1) {
      const behavior = bundle.behaviors[index];
      const behaviorPath = `behaviors[${index}]`;

      if (!isPlainObject(behavior)) {
        errors.push(`${behaviorPath} must be an object`);
        continue;
      }

      validateIdentifier(behavior.id, `${behaviorPath}.id`, errors);

      if (!isKnownBehaviorType(String(behavior.type))) {
        errors.push(`${behaviorPath}.type must be a supported behavior type`);
      }

      if (!Array.isArray(behavior.channels) || behavior.channels.length === 0) {
        errors.push(`${behaviorPath}.channels must be a non-empty array`);
      } else {
        for (let channelIndex = 0; channelIndex < behavior.channels.length; channelIndex += 1) {
          if (!isNonEmptyString(behavior.channels[channelIndex])) {
            errors.push(`${behaviorPath}.channels[${channelIndex}] must be a non-empty string`);
          }
        }
      }

      if (behavior.params !== undefined && !isPlainObject(behavior.params)) {
        errors.push(`${behaviorPath}.params must be an object`);
      }
    }
  }

  if (!isPlainObject(bundle.runtime)) {
    errors.push(`runtime must be an object`);
  } else if (!Array.isArray(bundle.runtime.api) || bundle.runtime.api.length === 0) {
    errors.push(`runtime.api must be a non-empty array`);
  } else {
    for (let index = 0; index < bundle.runtime.api.length; index += 1) {
      const method = bundle.runtime.api[index];
      if (!CHARBUNDLE_API_METHODS.includes(method as (typeof CHARBUNDLE_API_METHODS)[number])) {
        errors.push(`runtime.api[${index}] is not a supported runtime method`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
