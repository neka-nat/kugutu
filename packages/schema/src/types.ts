import type {
  BehaviorAllowedTargetMap,
  BehaviorParamsMap,
  BehaviorType,
} from "./behaviors.js";
import type {
  CharBundleAssetType,
  CharBundleRuntimeApiMethod,
} from "./bundle.js";
import type { CharacterExpression } from "./expressions.js";
import type { CharacterGesture } from "./gestures.js";
import type { VisemeMap } from "./visemes.js";
import type { PartEditableProperty, PartSlotKey } from "./parts.js";
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

export interface PartTransform {
  x?: number;
  y?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  spacing?: number;
  color?: string;
  layer?: number;
}

export interface CharacterPartCatalogItem {
  id: string;
  slot: PartSlotKey;
  displayName?: string;
  asset: string;
  nodes?: Partial<Record<SlotKey, string>>;
  editable?: PartEditableProperty[];
  defaults?: PartTransform;
}

export interface CharacterPartSelection {
  partId: string;
  transform?: PartTransform;
}

export interface CharacterParts {
  catalog: Record<string, CharacterPartCatalogItem>;
  selections: Partial<Record<PartSlotKey, CharacterPartSelection>>;
}

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
  parts?: CharacterParts;
  behaviors: CharacterBehavior[];
  expressions?: CharacterExpression[];
  gestures?: CharacterGesture[];
  visemes?: VisemeMap;
}

export interface CharBundleAsset {
  id: string;
  type: CharBundleAssetType;
  path: string;
}

export interface CharPackAsset {
  id: string;
  type: CharBundleAssetType;
  content: string;
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
  parts?: CharacterParts;
  behaviors: CompiledBehavior[];
  expressions: CharacterExpression[];
  gestures: CharacterGesture[];
  visemes: VisemeMap;
  runtime: CharBundleRuntime;
}

export interface CharPack {
  $schema?: string;
  packVersion: string;
  source?: CharacterDefinition;
  bundle: CharBundle;
  assets: CharPackAsset[];
  /**
   * Raw part fragments (catalog id → SVG fragment), included when the character
   * uses anchor-mounted file parts. Lets editors recompose the SVG when parts
   * change without re-reading the source tree.
   */
  partAssets?: Record<string, string>;
}
