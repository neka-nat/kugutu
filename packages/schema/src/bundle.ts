export const CHARACTER_SCHEMA_VERSION = "0.1.0" as const;
export const CHARBUNDLE_VERSION = "0.1.0" as const;
export const CHARPACK_VERSION = "0.1.0" as const;

export const CHARBUNDLE_API_METHODS = [
  "lookAt",
  "playBehavior",
  "setEmotion",
  "setMouthOpen",
] as const;

export type CharBundleRuntimeApiMethod =
  (typeof CHARBUNDLE_API_METHODS)[number];

export const CHARBUNDLE_ASSET_TYPES = ["svg"] as const;
export type CharBundleAssetType = (typeof CHARBUNDLE_ASSET_TYPES)[number];
