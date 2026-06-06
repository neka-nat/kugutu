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

async function main(): Promise<void> {
  const sourcePath = path.join(
    repoDir,
    "apps/web-basic/source/avatar-lite.character.json"
  );
  const outputPath = path.join(
    repoDir,
    "apps/web-basic/public/avatar-lite.charbundle.json"
  );
  const baseSvgPath = path.join(
    repoDir,
    "apps/web-basic/source/avatar.base.svg"
  );
  const outputSvgPath = path.join(repoDir, "apps/web-basic/public/avatar.svg");
  const outputPackPath = path.join(repoDir, "apps/web-basic/public/avatar.charpack");

  const [raw, baseSvg] = await Promise.all([
    readFile(sourcePath, "utf8"),
    readFile(baseSvgPath, "utf8"),
  ]);
  const document = JSON.parse(raw) as CharacterDefinition;
  const bundle = buildCharacterBundle(document);
  const serialized = `${JSON.stringify(bundle, null, 2)}\n`;
  const composedSvg = composeCharacterSvg(document, baseSvg);
  const pack = buildCharacterPack(document, baseSvg);
  const serializedPack = `${JSON.stringify(pack, null, 2)}\n`;

  await Promise.all([
    writeFile(outputPath, serialized, "utf8"),
    writeFile(outputSvgPath, composedSvg, "utf8"),
    writeFile(outputPackPath, serializedPack, "utf8"),
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
