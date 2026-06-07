import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildCharacterBundle,
  buildCharacterPack,
  composeCharacterSvg,
} from "@kugutu/compiler";
import type { CharacterDefinition } from "@kugutu/schema";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(rootDir, "..", "..");

/** Loads on-disk part fragments referenced by the catalog, relative to source. */
async function loadPartAssets(
  document: CharacterDefinition,
  sourceDir: string
): Promise<Record<string, string>> {
  const assets: Record<string, string> = {};

  for (const item of Object.values(document.parts?.catalog ?? {})) {
    if (!item.asset) {
      continue;
    }

    try {
      assets[item.id] = await readFile(path.resolve(sourceDir, item.asset), "utf8");
    } catch {
      // No fragment on disk: the part is expected to be a baked variant group.
    }
  }

  return assets;
}

async function main(): Promise<void> {
  const sourceDir = path.join(repoDir, "apps/web-basic/source");
  const sourcePath = path.join(sourceDir, "avatar.character.json");
  const baseSvgPath = path.join(sourceDir, "rig.svg");

  const outputPath = path.join(
    repoDir,
    "apps/web-basic/public/avatar-lite.charbundle.json"
  );
  const outputSvgPath = path.join(repoDir, "apps/web-basic/public/avatar.svg");
  const outputPackPath = path.join(repoDir, "apps/web-basic/public/avatar.charpack");

  const [raw, baseSvg] = await Promise.all([
    readFile(sourcePath, "utf8"),
    readFile(baseSvgPath, "utf8"),
  ]);
  const document = JSON.parse(raw) as CharacterDefinition;
  const partAssets = await loadPartAssets(document, sourceDir);

  const bundle = buildCharacterBundle(document);
  const composedSvg = composeCharacterSvg(document, baseSvg, { partAssets });
  const pack = buildCharacterPack(document, baseSvg, { partAssets });

  await Promise.all([
    writeFile(outputPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8"),
    writeFile(outputSvgPath, composedSvg, "utf8"),
    writeFile(outputPackPath, `${JSON.stringify(pack, null, 2)}\n`, "utf8"),
  ]);
  console.log(`synced: ${outputPath}`);
  console.log(`synced: ${outputSvgPath}`);
  console.log(`synced: ${outputPackPath}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
