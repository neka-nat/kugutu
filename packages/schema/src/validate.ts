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
import { isKnownSlot, type SlotKey } from "./slots.js";
import { TEMPLATES, isKnownTemplate, type TemplateDefinition, type TemplateKey } from "./templates.js";
import type { CharacterBehavior, SlotBindingMap, ValidationResult } from "./types.js";

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
