import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildCharacterBundle,
  composeCharacterSvg,
  lintCharacter,
} from "@kugutu/compiler";
import {
  CHARACTER_SCHEMA_VERSION,
  validateCharBundle,
  validateCharacterDefinition,
  type CharBundle,
  type CharacterDefinition,
} from "@kugutu/schema";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
// Compiled output lives in dist/scripts, so the repository root is two levels up.
const repoDir = path.resolve(rootDir, "..", "..");

async function readJson<T>(relativePath: string): Promise<T> {
  const fullPath = path.join(repoDir, relativePath);
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw) as T;
}

interface PartFixture {
  document: CharacterDefinition;
  svg: string;
  partAssets: Record<string, string>;
}

function buildPartFixture(): PartFixture {
  const document: CharacterDefinition = {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    character: { id: "lint-fixture", template: "avatar-lite" },
    assets: { primary: "avatar.svg" },
    slots: {
      head: "head",
      "eye.l": "eye_left",
      "eye.r": "eye_right",
      mouth: "mouth",
      torso: "torso",
    },
    parts: {
      catalog: {
        "eye-test-01": {
          id: "eye-test-01",
          slot: "eye",
          asset: "parts/eye-test-01.svg",
          editable: ["scale"],
        },
      },
      selections: {
        eye: { partId: "eye-test-01" },
      },
    },
    behaviors: [],
  };

  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<g data-kugutu-slot-mount="eye"></g></svg>';

  return {
    document,
    svg,
    partAssets: { "eye-test-01": '<circle cx="50" cy="50" r="10" />' },
  };
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
    {
      label: "file-based part asset is injected into its slot mount",
      validate: () => {
        const fixture = buildPartFixture();
        const composed = composeCharacterSvg(fixture.document, fixture.svg, {
          partAssets: fixture.partAssets,
        });
        assert.match(composed, /data-kugutu-variant-id="eye-test-01"/);
        assert.match(composed, /<circle/);
        return { valid: true, errors: [] };
      },
    },
    {
      label: "selecting an unrenderable part is reported, not silently dropped",
      validate: () => {
        const fixture = buildPartFixture();
        const result = lintCharacter(fixture.document, fixture.svg, {});
        assert.equal(result.valid, false);
        assert.ok(
          result.errors.some((error) => error.includes("eye-test-01")),
          "expected lint to flag the unrenderable selected part"
        );
        assert.throws(() => composeCharacterSvg(fixture.document, fixture.svg, {}));
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
