import type {
  BehaviorAllowedTargetMap,
  BehaviorParamsMap,
  BehaviorType,
} from "./behaviors.js";
import type {
  CharBundleAssetType,
  CharBundleRuntimeApiMethod,
} from "./bundle.js";
import type { SlotKey } from "./slots.js";
import type { TemplateKey } from "./templates.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface CharacterMetadata {
  id: string;
  displayName?: string;
  template: TemplateKey;
}

export interface CharacterAssets {
  primary: string;
}

export type SlotBindingMap = Partial<Record<SlotKey, string>>;

export interface CharacterBehavior<T extends BehaviorType = BehaviorType> {
  id: string;
  type: T;
  targets: BehaviorAllowedTargetMap[T][];
  params?: Partial<BehaviorParamsMap[T]>;
}

export interface CharacterDefinition {
  $schema?: string;
  schemaVersion: string;
  character: CharacterMetadata;
  assets: CharacterAssets;
  slots: SlotBindingMap;
  behaviors: CharacterBehavior[];
}

export interface CharBundleAsset {
  id: string;
  type: CharBundleAssetType;
  path: string;
}

export interface CompiledBehavior<T extends BehaviorType = BehaviorType> {
  id: string;
  type: T;
  channels: string[];
  params?: Partial<BehaviorParamsMap[T]>;
}

export interface CharBundleBindings {
  slots: SlotBindingMap;
}

export interface CharBundleRuntime {
  api: CharBundleRuntimeApiMethod[];
}

export interface CharBundle {
  $schema?: string;
  bundleVersion: string;
  sourceSchemaVersion: string;
  character: Pick<CharacterMetadata, "id" | "template">;
  assets: CharBundleAsset[];
  bindings: CharBundleBindings;
  behaviors: CompiledBehavior[];
  runtime: CharBundleRuntime;
}
