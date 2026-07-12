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
  DEFAULT_GESTURES,
  DEFAULT_VISEMES,
  validateCharBundle,
  validateCharacterDefinition,
  visemesFromText,
  type CharBundle,
  type CharacterDefinition,
  type GestureTrack,
} from "@kugutu/schema";
import { mouthCurveFromSamples } from "@kugutu/runtime-web";

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

function buildLayeredOutfitFixture(
  layeredAsset: boolean,
  layeredRig: boolean
): PartFixture {
  const document: CharacterDefinition = {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    character: { id: "layered-outfit-fixture", template: "avatar-lite" },
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
        "outfit-test-01": {
          id: "outfit-test-01",
          slot: "outfit",
          asset: "parts/outfit-test-01.svg",
          editable: ["color"],
        },
      },
      selections: {
        outfit: { partId: "outfit-test-01" },
      },
    },
    behaviors: [],
  };

  const frontMount = layeredRig
    ? '<g data-kugutu-slot-mount="outfit" data-kugutu-slot-layer="front"></g>'
    : "";
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<g id="torso_group"><g data-kugutu-slot-mount="outfit"></g></g>' +
    `<g id="neck_group"><rect width="10" height="20" />${frontMount}</g>` +
    '<g id="head_group"></g><g id="eye_left"></g><g id="eye_right"></g>' +
    '<g id="mouth_group"></g></svg>';
  const asset = layeredAsset
    ? '<g><path data-test-layer="base" d="M0 0h10v10z" />' +
      '<path data-kugutu-part-layer="front" data-test-layer="front" d="M0 0h5v5z" /></g>'
    : '<path data-test-layer="base" d="M0 0h10v10z" />';

  return {
    document,
    svg,
    partAssets: { "outfit-test-01": asset },
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
          partAssets: {
            "eye-dot-01":
              '<ellipse rx="10" ry="8" fill="#FFFFFF" data-kugutu-color-preserve />' +
              '<circle r="6" fill="#34344A" />',
          },
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
        assert.match(
          composed,
          /\[fill\]:not\(\[fill="none"\]\):not\(\[data-kugutu-color-preserve\]\)/,
          "authored colors can opt out of the part color override"
        );
        assert.match(
          composed,
          /fill="#FFFFFF" data-kugutu-color-preserve/,
          "preserved eye artwork remains marked in the composed SVG"
        );
        return { valid: true, errors: [] };
      },
    },
    {
      label: "layered parts preserve legacy rigs and target matching mounts",
      validate: () => {
        const count = (svg: string, pattern: RegExp): number =>
          (svg.match(pattern) ?? []).length;

        const legacyAsset = buildLayeredOutfitFixture(false, true);
        const legacyAssetComposed = composeCharacterSvg(
          legacyAsset.document,
          legacyAsset.svg,
          { partAssets: legacyAsset.partAssets }
        );
        assert.equal(
          count(legacyAssetComposed, /data-test-layer="base"/g),
          1,
          "an unlayered asset is not duplicated into a layered mount"
        );
        assert.equal(
          count(legacyAssetComposed, /<g data-kugutu-variant-slot="outfit" data-kugutu-variant-id="outfit-test-01"/g),
          1,
          "legacy artwork stays in the default mount only"
        );

        const legacyRig = buildLayeredOutfitFixture(true, false);
        const legacyRigComposed = composeCharacterSvg(
          legacyRig.document,
          legacyRig.svg,
          { partAssets: legacyRig.partAssets }
        );
        assert.equal(count(legacyRigComposed, /data-test-layer="base"/g), 1);
        assert.equal(
          count(legacyRigComposed, /data-test-layer="front"/g),
          1,
          "a layered asset remains intact when the rig has no matching mount"
        );
        assert.equal(
          count(legacyRigComposed, /<g data-kugutu-variant-slot="outfit" data-kugutu-variant-id="outfit-test-01"/g),
          1
        );

        const layered = buildLayeredOutfitFixture(true, true);
        const layeredComposed = composeCharacterSvg(
          layered.document,
          layered.svg,
          { partAssets: layered.partAssets }
        );
        assert.equal(count(layeredComposed, /data-test-layer="base"/g), 1);
        assert.equal(count(layeredComposed, /data-test-layer="front"/g), 1);
        assert.equal(
          count(layeredComposed, /<g data-kugutu-variant-slot="outfit" data-kugutu-variant-id="outfit-test-01"/g),
          2,
          "base and front layers share the same runtime-visible variant id"
        );

        const baseIndex = layeredComposed.indexOf('data-test-layer="base"');
        const neckIndex = layeredComposed.indexOf('id="neck_group"');
        const frontIndex = layeredComposed.indexOf('data-test-layer="front"');
        assert.ok(
          baseIndex !== -1 &&
            neckIndex !== -1 &&
            frontIndex !== -1 &&
            baseIndex < neckIndex &&
            neckIndex < frontIndex,
          "layered artwork is ordered base/rear, neck, then front"
        );

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
      label: "wave and raise-hand keep face-clear arm profiles",
      validate: () => {
        const cases = [
          {
            id: "wave",
            upperArm: [0, -60, -60, 0],
            forearm: [0, 94, 82, 94, 82, 88, 0],
          },
          {
            id: "raise-hand",
            upperArm: [0, -76, -76, 0],
            forearm: [0, 112, 112, 0],
          },
        ] as const;

        for (const expected of cases) {
          const gesture = DEFAULT_GESTURES.find((item) => item.id === expected.id);
          assert.ok(gesture, "gesture is defined: " + expected.id);

          const rotations = (slot: "upperArm.r" | "forearm.r") =>
            gesture.tracks
              .find((track) => track.slot === slot)
              ?.keyframes.map((keyframe) =>
                keyframe.rotate === 0 ? 0 : keyframe.rotate
              );

          assert.deepEqual(
            rotations("upperArm.r"),
            expected.upperArm,
            "face-clear shoulder lift: " + expected.id
          );
          assert.deepEqual(
            rotations("forearm.r"),
            expected.forearm,
            "face-clear elbow profile: " + expected.id
          );
        }

        return { valid: true, errors: [] };
      },
    },
    {
      label: "single-arm gestures provide mirrored left variants",
      validate: () => {
        const pairs = [
          ["wave", "wave-left"],
          ["raise-hand", "raise-hand-left"],
          ["point", "point-left"],
          ["ok", "ok-left"],
        ] as const;

        for (const [rightId, leftId] of pairs) {
          const right = DEFAULT_GESTURES.find((item) => item.id === rightId);
          const left = DEFAULT_GESTURES.find((item) => item.id === leftId);
          assert.ok(right, "right gesture is defined: " + rightId);
          assert.ok(left, "left gesture is defined: " + leftId);
          assert.equal(left.durationMs, right.durationMs, "durations match: " + rightId);

          for (const rightTrack of right.tracks) {
            const leftSlot =
              rightTrack.slot === "upperArm.r"
                ? "upperArm.l"
                : rightTrack.slot === "forearm.r"
                  ? "forearm.l"
                  : null;
            assert.ok(leftSlot, "right-only arm track: " + rightTrack.slot);
            const leftTrack: GestureTrack | undefined = left.tracks.find(
              (track: GestureTrack) => track.slot === leftSlot
            );
            assert.ok(leftTrack, "mirrored track is defined: " + leftId + ":" + leftSlot);
            assert.deepEqual(
              leftTrack.keyframes.map((keyframe) => keyframe.t),
              rightTrack.keyframes.map((keyframe) => keyframe.t),
              "keyframe timing is mirrored: " + rightId
            );
            assert.deepEqual(
              leftTrack.keyframes.map((keyframe) => {
                const rotation = keyframe.rotate ?? 0;
                return rotation === 0 ? 0 : rotation;
              }),
              rightTrack.keyframes.map((keyframe) => {
                const rotation = keyframe.rotate ?? 0;
                return rotation === 0 ? 0 : -rotation;
              }),
              "keyframe rotation is mirrored: " + rightId
            );
          }
        }

        return { valid: true, errors: [] };
      },
    },
    {
      label: "thank-you keeps a relaxed mirrored elbow bend",
      validate: () => {
        const gesture = DEFAULT_GESTURES.find((item) => item.id === "thank-you");
        assert.ok(gesture, "thank-you gesture is defined");

        const right = gesture.tracks.find((track) => track.slot === "forearm.r");
        const left = gesture.tracks.find((track) => track.slot === "forearm.l");
        assert.deepEqual(
          right?.keyframes.map((keyframe) =>
            keyframe.rotate === 0 ? 0 : keyframe.rotate
          ),
          [0, -10, -10, 0],
          "right elbow does not fold too tightly"
        );
        assert.deepEqual(
          left?.keyframes.map((keyframe) =>
            keyframe.rotate === 0 ? 0 : keyframe.rotate
          ),
          [0, 10, 10, 0],
          "left elbow mirrors the relaxed bend"
        );
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
    {
      label: "visemesFromText produces a contiguous timed ja cue track",
      validate: () => {
        const durationMs = 1200;
        const cues = visemesFromText("こんにちは、世界！", { durationMs });
        assert.ok(cues.length > 0, "expected cues for mixed kana/kanji text");
        assert.equal(cues[0]!.startMs, 0, "track starts at 0");
        assert.equal(
          cues[cues.length - 1]!.endMs,
          durationMs,
          "track ends exactly at durationMs"
        );

        let previousEndMs = 0;
        for (const cue of cues) {
          assert.equal(cue.startMs, previousEndMs, "cues are contiguous");
          assert.ok(cue.endMs! > cue.startMs, "cues have positive length");
          assert.ok(
            cue.viseme in DEFAULT_VISEMES,
            `viseme "${cue.viseme}" exists in the built-in library`
          );
          previousEndMs = cue.endMs!;
        }

        const bilabial = visemesFromText("まんまるパン", { durationMs: 1000 });
        assert.ok(
          bilabial.some((cue) => cue.viseme === "PP"),
          "bilabial rows get a PP lip-close onset"
        );
        assert.ok(
          bilabial.some((cue) => cue.viseme === "nn"),
          "moraic nasal maps to nn"
        );

        assert.deepEqual(
          cues,
          visemesFromText("こんにちは、世界！", { durationMs }),
          "output is deterministic"
        );
        assert.deepEqual(visemesFromText("", { durationMs }), []);
        return { valid: true, errors: [] };
      },
    },
    {
      label: "mouthCurveFromSamples opens on voice and closes on silence",
      validate: () => {
        const sampleRate = 16000;
        const fps = 30;
        // 1s clip: a 440Hz tone in the first half, silence in the second.
        const samples = new Float32Array(sampleRate);
        for (let index = 0; index < sampleRate / 2; index += 1) {
          samples[index] =
            0.4 * Math.sin((2 * Math.PI * 440 * index) / sampleRate);
        }

        const curve = mouthCurveFromSamples(samples, sampleRate, { fps });
        assert.equal(curve.length, fps, "one value per output frame");
        assert.ok(
          curve.every((value) => value >= 0 && value <= 1),
          "values stay in [0, 1]"
        );
        assert.ok(
          Math.max(...curve.slice(3, 15)) > 0.5,
          "voiced region opens the mouth"
        );
        assert.ok(
          curve[curve.length - 1]! < 0.1,
          "trailing silence closes the mouth"
        );
        assert.deepEqual(
          curve,
          mouthCurveFromSamples(samples, sampleRate, { fps }),
          "curve is deterministic"
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
