import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildCharacterBundle,
  composeCharacterSvg,
} from "../packages/compiler/src/index.js";
import type { CharacterDefinition } from "../packages/schema/src/index.js";

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

  const [raw, baseSvg] = await Promise.all([
    readFile(sourcePath, "utf8"),
    readFile(baseSvgPath, "utf8"),
  ]);
  const document = JSON.parse(raw) as CharacterDefinition;
  const bundle = buildCharacterBundle(document);
  const serialized = `${JSON.stringify(bundle, null, 2)}\n`;
  const composedSvg = composeCharacterSvg(document, baseSvg);

  await Promise.all([
    writeFile(outputPath, serialized, "utf8"),
    writeFile(outputSvgPath, composedSvg, "utf8"),
  ]);
  console.log(`synced: ${outputPath}`);
  console.log(`synced: ${outputSvgPath}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
