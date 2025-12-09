import {
  CHARBUNDLE_API_METHODS,
  CHARBUNDLE_VERSION,
  CHARACTER_SCHEMA_VERSION,
  validateCharacterDefinition,
  type BehaviorType,
  type CharBundle,
  type CharBundleRuntimeApiMethod,
  type CharacterBehavior,
  type CharacterDefinition,
  type CompiledBehavior,
  type SlotBindingMap,
  type SlotKey,
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

function formatErrors(errors: string[]): string {
  return errors.map((error) => `- ${error}`).join("\n");
}

export function buildCharacterBundle(document: CharacterDefinition): CharBundle {
  const validation = validateCharacterDefinition(document);
  if (!validation.valid) {
    throw new Error(`Invalid character definition:\n${formatErrors(validation.errors)}`);
  }

  return {
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
}
