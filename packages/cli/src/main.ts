#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildCharacterBundle } from "../../compiler/src/index.js";
import {
  validateCharacterDefinition,
  type CharacterDefinition,
} from "../../schema/src/index.js";

function printUsage(): void {
  console.log(`Usage:
  kugutu validate <source.json>
  kugutu build <source.json> --out <bundle.json>`);
}

async function readJson(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as unknown;
}

function formatErrors(errors: string[]): string {
  return errors.map((error) => `- ${error}`).join("\n");
}

async function validateCommand(sourcePath: string): Promise<void> {
  const document = await readJson(sourcePath);
  const result = validateCharacterDefinition(document);

  if (!result.valid) {
    console.error(formatErrors(result.errors));
    process.exitCode = 1;
    return;
  }

  console.log(`valid: ${sourcePath}`);
}

function parseOutPath(args: string[]): string {
  const outIndex = args.indexOf("--out");
  if (outIndex === -1 || outIndex === args.length - 1) {
    throw new Error(`Missing required --out <bundle.json>`);
  }

  return args[outIndex + 1]!;
}

async function buildCommand(sourcePath: string, args: string[]): Promise<void> {
  const outPath = parseOutPath(args);
  const document = (await readJson(sourcePath)) as CharacterDefinition;
  const bundle = buildCharacterBundle(document);
  const serialized = `${JSON.stringify(bundle, null, 2)}\n`;

  await writeFile(outPath, serialized, "utf8");
  console.log(`built: ${path.resolve(outPath)}`);
}

async function main(argv: string[]): Promise<void> {
  const [command, sourcePath, ...rest] = argv;

  if (!command || command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  if (!sourcePath) {
    throw new Error(`Missing source file path`);
  }

  if (command === "validate") {
    await validateCommand(sourcePath);
    return;
  }

  if (command === "build") {
    await buildCommand(sourcePath, rest);
    return;
  }

  throw new Error(`Unsupported command: ${command}`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
