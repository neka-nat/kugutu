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
    {
      label: "anchor parts inject into paired mounts with baked transform/color",
      validate: () => {
        const document: CharacterDefinition = {
          schemaVersion: CHARACTER_SCHEMA_VERSION,
          character: { id: "anchor-fixture", template: "avatar-lite" },
          assets: { primary: "rig.svg" },
          slots: {
            head: "head_group",
            "eye.l": "eye_left",
            "eye.r": "eye_right",
            mouth: "mouth_group",
            torso: "torso_group",
          },
          parts: {
            catalog: {
              "eye-dot-01": {
                id: "eye-dot-01",
                slot: "eye",
                asset: "parts/eye/dot-01.svg",
                editable: ["scale", "spacing", "color"],
              },
            },
            selections: {
              eye: { partId: "eye-dot-01", transform: { scale: 1.2, color: "#123456" } },
            },
          },
          behaviors: [],
        };
        const rig =
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320">' +
          '<g id="torso_group"></g><g id="head_group">' +
          '<g transform="translate(132 134)"><g id="eye_left"><g data-kugutu-slot-mount="eye"></g></g></g>' +
          '<g transform="translate(188 134)"><g id="eye_right"><g data-kugutu-slot-mount="eye" transform="scale(-1 1)"></g></g></g>' +
          '<g id="mouth_group"></g></g></svg>';
        const composed = composeCharacterSvg(document, rig, {
          partAssets: { "eye-dot-01": '<circle r="6" />' },
        });

        const injected = (
          composed.match(/variant-slot="eye" data-kugutu-variant-id="eye-dot-01"/g) ?? []
        ).length;
        assert.equal(injected, 2, "fragment placed into both paired mounts");
        assert.match(
          composed,
          /data-kugutu-variant-id="eye-dot-01"[^>]*transform="scale\(1\.2 1\.2\)"/,
          "selected part transform is baked onto the variant group"
        );
        assert.match(composed, /data-kugutu-part-color="eye-dot-01"/, "color marker baked");
        return { valid: true, errors: [] };
      },
    },
    {
      label: "default expressions/gestures are baked into the bundle",
      validate: () => {
        const bundle = buildCharacterBundle(characterExample);
        assert.deepEqual(
          [...bundle.expressions.map((expression) => expression.id)].sort(),
          ["angry", "happy", "sad", "surprised"]
        );
        const gestureIds = bundle.gestures.map((gesture) => gesture.id);
        assert.ok(
          gestureIds.includes("nod") && gestureIds.includes("shake"),
          "head gestures are included"
        );
        assert.ok(
          !gestureIds.includes("wave"),
          "wave is pruned without arm slots"
        );
        for (const method of ["playGesture", "setPart", "setVariant", "tunePart"]) {
          assert.ok(
            bundle.runtime.api.includes(method as never),
            `runtime.api includes ${method}`
          );
        }
        return { valid: true, errors: [] };
      },
    },
    {
      label: "presets are baked into the bundle and expose applyPreset",
      validate: () => {
        const fixture = buildPartFixture();
        fixture.document.presets = [
          {
            id: "alt-look",
            displayName: "Alt look",
            selections: {
              eye: { partId: "eye-test-01", transform: { scale: 1.2 } },
            },
          },
        ];
        const bundle = buildCharacterBundle(fixture.document);
        assert.ok(
          bundle.presets?.some((preset) => preset.id === "alt-look"),
          "preset baked into the bundle"
        );
        assert.ok(
          bundle.runtime.api.includes("applyPreset" as never),
          "applyPreset exposed when a character has presets"
        );

        const withoutPresets = buildCharacterBundle(buildPartFixture().document);
        assert.ok(
          !withoutPresets.runtime.api.includes("applyPreset" as never),
          "applyPreset omitted when there are no presets"
        );

        const bad = buildPartFixture();
        bad.document.presets = [
          { id: "bad", selections: { eye: { partId: "missing-part" } } },
        ];
        assert.throws(
          () => buildCharacterBundle(bad.document),
          "preset referencing an unknown part is rejected"
        );
        return { valid: true, errors: [] };
      },
    },
    {
      label: "default visemes are baked in and speak is exposed for mouthed characters",
      validate: () => {
        const bundle = buildCharacterBundle(characterExample);
        assert.ok(bundle.visemes.sil && bundle.visemes.aa, "default visemes present");
        assert.ok(
          bundle.runtime.api.includes("speak"),
          "speak exposed when a mouth slot is bound"
        );

        const fixture = buildPartFixture(); // avatar-lite -> has a mouth slot
        fixture.document.visemes = { aa: { open: 0.5, width: 1.3 } };
        const overridden = buildCharacterBundle(fixture.document);
        assert.equal(overridden.visemes.aa?.open, 0.5, "author viseme overrides default");
        assert.equal(overridden.visemes.aa?.width, 1.3, "author viseme width applied");
        assert.ok(overridden.visemes.sil, "default visemes retained alongside overrides");
        return { valid: true, errors: [] };
      },
    },
    {
      label: "author expressions/gestures override defaults and prune missing slots",
      validate: () => {
        const fixture = buildPartFixture(); // slots: head, eye.l/r, mouth, torso
        fixture.document.expressions = [
          { id: "happy", poses: [{ slot: "mouth", scaleY: 0.5 }] },
          { id: "wink", poses: [{ slot: "eye.l", scaleY: -0.4 }] },
        ];
        fixture.document.gestures = [
          {
            id: "nudge",
            durationMs: 300,
            tracks: [
              { slot: "head", keyframes: [{ t: 0, translateY: 0 }, { t: 1, translateY: 5 }] },
            ],
          },
        ];

        const bundle = buildCharacterBundle(fixture.document);
        const happy = bundle.expressions.find((expression) => expression.id === "happy");
        assert.deepEqual(happy?.poses, [{ slot: "mouth", scaleY: 0.5 }], "happy overridden by author");
        assert.ok(
          bundle.expressions.some((expression) => expression.id === "wink"),
          "custom expression added"
        );
        const sad = bundle.expressions.find((expression) => expression.id === "sad");
        assert.ok(sad, "sad retained (still targets eye/mouth/head slots)");
        assert.ok(
          !sad?.poses.some(
            (pose) => pose.slot === "brow.l" || pose.slot === "brow.r"
          ),
          "sad brow poses pruned (character has no brow slots)"
        );
        assert.ok(
          bundle.gestures.some((gesture) => gesture.id === "nudge"),
          "custom gesture added"
        );
        assert.ok(
          bundle.gestures.some((gesture) => gesture.id === "nod"),
          "default head gesture retained"
        );
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
