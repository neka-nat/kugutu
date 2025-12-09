import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildCharacterBundle } from "../packages/compiler/src/index.js";
import {
  validateCharBundle,
  validateCharacterDefinition,
  type CharBundle,
  type CharacterDefinition,
} from "../packages/schema/src/index.js";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
// Compiled output lives in dist/scripts, so the repository root is two levels up.
const repoDir = path.resolve(rootDir, "..", "..");

async function readJson<T>(relativePath: string): Promise<T> {
  const fullPath = path.join(repoDir, relativePath);
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw) as T;
}

async function main(): Promise<void> {
  const characterExample = await readJson<CharacterDefinition>(
    "packages/schema/examples/avatar-lite.character.json"
  );
  const charbundleExample = await readJson<CharBundle>(
    "packages/schema/examples/avatar-lite.charbundle.json"
  );

  const checks = [
    {
      label: "character example",
      validate: () => validateCharacterDefinition(characterExample),
    },
    {
      label: "charbundle example",
      validate: () => validateCharBundle(charbundleExample),
    },
    {
      label: "compiled charbundle matches example",
      validate: () => {
        const compiled = buildCharacterBundle(characterExample);
        const expected = { ...charbundleExample };
        delete expected.$schema;
        assert.deepEqual(compiled, expected);
        return { valid: true, errors: [] };
      },
    },
  ];

  let hasErrors = false;

  for (const check of checks) {
    const result = check.validate();

    if (result.valid) {
      console.log(`ok: ${check.label}`);
      continue;
    }

    hasErrors = true;
    console.error(`invalid: ${check.label}`);
    for (const error of result.errors) {
      console.error(`  - ${error}`);
    }
  }

  if (hasErrors) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
