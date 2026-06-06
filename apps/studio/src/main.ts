import {
  buildCharacterBundle,
  buildCharacterPack,
  composeCharacterSvg,
} from "@kugutu/compiler";
import { createCharacterPlayer, type CharacterPlayer } from "@kugutu/runtime-web";
import type {
  CharPack,
  CharacterDefinition,
  CharacterPartCatalogItem,
  CharacterPartSelection,
  PartSlotKey,
  PartTransform,
} from "@kugutu/schema";

import "./styles.css";

type NumericTransformKey =
  | "x"
  | "y"
  | "scale"
  | "rotation"
  | "spacing"
  | "layer";

type ExportKind = "charpack";

interface StudioState {
  character: CharacterDefinition;
  activeSlot: PartSlotKey;
  emotion: string;
  mouthOpen: number;
}

interface CharacterRecipe {
  id: string;
  label: string;
  parts: Partial<Record<PartSlotKey, string>>;
}

const NUMERIC_FIELDS: {
  key: NumericTransformKey;
  label: string;
  min: number;
  max: number;
  step: number;
  fallback: number;
}[] = [
  { key: "x", label: "X", min: -80, max: 80, step: 1, fallback: 0 },
  { key: "y", label: "Y", min: -80, max: 80, step: 1, fallback: 0 },
  { key: "scale", label: "Scale", min: 0.5, max: 1.8, step: 0.01, fallback: 1 },
  { key: "rotation", label: "Rotation", min: -45, max: 45, step: 1, fallback: 0 },
  { key: "spacing", label: "Spacing", min: -40, max: 40, step: 1, fallback: 0 },
  { key: "layer", label: "Layer", min: -20, max: 20, step: 1, fallback: 0 },
];

const EMOTIONS = ["neutral", "happy", "sad", "angry", "surprised"];
const EXPORT_KINDS = ["charpack"] as const;
const CHARACTER_RECIPES: CharacterRecipe[] = [
  {
    id: "dev",
    label: "Developer",
    parts: {
      face: "face-dev-01",
      "hair.back": "hair-back-dev-01",
      "hair.front": "hair-front-dev-01",
      eye: "eye-glasses-01",
      brow: "brow-dev-01",
      nose: "nose-soft-01",
      mouth: "mouth-smirk-01",
      outfit: "outfit-dev-01",
    },
  },
  {
    id: "puppet",
    label: "Puppet",
    parts: {
      face: "face-warm-01",
      "hair.back": "hair-back-puppet-01",
      "hair.front": "hair-front-puppet-01",
      eye: "eye-puppet-01",
      brow: "brow-rounded-01",
      nose: "nose-round-01",
      mouth: "mouth-open-01",
      outfit: "outfit-hoodie-01",
    },
  },
  {
    id: "robot",
    label: "Robot",
    parts: {
      face: "face-display-01",
      "hair.back": "hair-back-none-01",
      "hair.front": "hair-front-leaf-01",
      eye: "eye-screen-01",
      brow: "brow-screen-01",
      nose: "nose-dot-01",
      mouth: "mouth-screen-01",
      outfit: "outfit-robot-01",
    },
  },
  {
    id: "assistant",
    label: "Assistant",
    parts: {
      face: "face-soft-01",
      "hair.back": "hair-back-bob-01",
      "hair.front": "hair-front-bob-01",
      eye: "eye-stage-01",
      brow: "brow-soft-01",
      nose: "nose-dot-01",
      mouth: "mouth-smile-01",
      outfit: "outfit-blue-01",
    },
  },
  {
    id: "paper",
    label: "Paper",
    parts: {
      face: "face-paper-01",
      "hair.back": "hair-back-paper-01",
      "hair.front": "hair-front-paper-01",
      eye: "eye-paper-01",
      brow: "brow-paper-01",
      nose: "nose-triangle-01",
      mouth: "mouth-paper-01",
      outfit: "outfit-overalls-01",
    },
  },
  {
    id: "stage",
    label: "Stage",
    parts: {
      face: "face-stage-01",
      "hair.back": "hair-back-stage-01",
      "hair.front": "hair-front-stage-01",
      eye: "eye-stage-01",
      brow: "brow-stage-01",
      nose: "nose-button-01",
      mouth: "mouth-stage-01",
      outfit: "outfit-stage-01",
    },
  },
];

const root = document.querySelector<HTMLElement>("#app");
if (!root) {
  throw new Error("Studio root not found.");
}
const app: HTMLElement = root;

async function loadInitialPack(): Promise<CharPack> {
  const response = await fetch(`${import.meta.env.BASE_URL}avatar.charpack`);
  if (!response.ok) {
    throw new Error(`Failed to fetch avatar.charpack: ${response.status}`);
  }

  return response.json() as Promise<CharPack>;
}

function getInitialCharacter(pack: CharPack): CharacterDefinition {
  if (!pack.source) {
    throw new Error("Studio requires a charpack with embedded source data.");
  }

  return pack.source;
}

function getInitialBaseSvg(pack: CharPack): string {
  const sourceSvg =
    pack.assets.find((asset) => asset.id === "source-svg" && asset.type === "svg") ??
    pack.assets.find((asset) => asset.id === "primary-svg" && asset.type === "svg") ??
    pack.assets.find((asset) => asset.type === "svg");

  if (!sourceSvg) {
    throw new Error("Studio requires a charpack with an SVG asset.");
  }

  return sourceSvg.content;
}

let baseSvgText = "";

let state: StudioState;

let player: CharacterPlayer | null = null;

function cloneCharacter(document: CharacterDefinition): CharacterDefinition {
  return JSON.parse(JSON.stringify(document)) as CharacterDefinition;
}

function isExportKind(value: string): value is ExportKind {
  return EXPORT_KINDS.includes(value as ExportKind);
}

function exportBaseName(): string {
  return state.character.character.id || "character";
}

function downloadText(fileName: string, contents: string, mimeType: string): void {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function getCatalogEntries(slot: PartSlotKey): CharacterPartCatalogItem[] {
  return Object.values(state.character.parts?.catalog ?? {})
    .filter((item) => item.slot === slot)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function getPartSlots(): PartSlotKey[] {
  const slots = new Set<PartSlotKey>();

  for (const item of Object.values(state.character.parts?.catalog ?? {})) {
    slots.add(item.slot);
  }

  for (const slot of Object.keys(state.character.parts?.selections ?? {})) {
    slots.add(slot as PartSlotKey);
  }

  return [...slots].sort((a, b) => a.localeCompare(b));
}

function getSelection(slot: PartSlotKey): CharacterPartSelection | undefined {
  return state.character.parts?.selections[slot];
}

function getSelectedItem(slot: PartSlotKey): CharacterPartCatalogItem | undefined {
  const selection = getSelection(slot);
  if (!selection) {
    return undefined;
  }

  return state.character.parts?.catalog[selection.partId];
}

function getMergedTransform(slot: PartSlotKey): PartTransform {
  const selection = getSelection(slot);
  const item = getSelectedItem(slot);

  return {
    ...(item?.defaults ?? {}),
    ...(selection?.transform ?? {}),
  };
}

function ensureSelection(slot: PartSlotKey): CharacterPartSelection {
  if (!state.character.parts) {
    state.character.parts = { catalog: {}, selections: {} };
  }

  const existing = state.character.parts.selections[slot];
  if (existing) {
    return existing;
  }

  const firstPart = getCatalogEntries(slot)[0];
  if (!firstPart) {
    throw new Error(`No parts available for ${slot}`);
  }

  const nextSelection: CharacterPartSelection = { partId: firstPart.id };
  state.character.parts.selections[slot] = nextSelection;
  return nextSelection;
}

function setPart(slot: PartSlotKey, partId: string): void {
  if (!state.character.parts) {
    return;
  }

  const item = state.character.parts.catalog[partId];
  if (!item || item.slot !== slot) {
    return;
  }

  const current = state.character.parts.selections[slot];
  const transform = current?.transform ? { ...current.transform } : undefined;
  state.character.parts.selections[slot] = {
    partId,
    ...(transform ? { transform } : {}),
  };
}

function applyRecipe(recipe: CharacterRecipe): void {
  if (!state.character.parts) {
    return;
  }

  for (const [slotValue, partId] of Object.entries(recipe.parts)) {
    const slot = slotValue as PartSlotKey;
    const item = state.character.parts.catalog[partId];
    if (!item || item.slot !== slot) {
      continue;
    }

    state.character.parts.selections[slot] = { partId };
  }
}

function updateTransform(slot: PartSlotKey, patch: PartTransform): void {
  const selection = ensureSelection(slot);
  selection.transform = {
    ...(selection.transform ?? {}),
    ...patch,
  };
}

function emotionIntensity(emotion: string): number {
  const intensities: Record<string, number> = {
    neutral: 0,
    happy: 0.55,
    sad: 0.4,
    angry: 0.55,
    surprised: 0.75,
  };

  return intensities[emotion] ?? 0.45;
}

function destroyPlayer(): void {
  player?.destroy();
  player = null;
}

function renderPreview(): void {
  const preview = document.querySelector<HTMLElement>("#studio-preview");
  const readout = document.querySelector<HTMLTextAreaElement>("#source-readout");

  if (!preview || !readout) {
    return;
  }

  destroyPlayer();

  const characterDocument = cloneCharacter(state.character);
  const svgText = composeCharacterSvg(characterDocument, baseSvgText);
  const bundle = buildCharacterBundle(characterDocument);

  preview.innerHTML = svgText;
  const svgRoot = preview.querySelector<SVGSVGElement>("svg");
  if (svgRoot) {
    player = createCharacterPlayer(bundle, svgRoot);
    player.setEmotion(state.emotion, emotionIntensity(state.emotion));
    player.setMouthOpen(state.mouthOpen);
    player.start();
  }

  readout.value = JSON.stringify(characterDocument.parts?.selections ?? {}, null, 2);
}

function exportArtifact(kind: ExportKind): void {
  const characterDocument = cloneCharacter(state.character);
  const baseName = exportBaseName();

  downloadText(
    `${baseName}.charpack`,
    `${JSON.stringify(buildCharacterPack(characterDocument, baseSvgText), null, 2)}\n`,
    "application/json;charset=utf-8"
  );
}

function formatTransformValue(transform: PartTransform, field: NumericTransformKey, fallback: number): number {
  const value = transform[field];
  return typeof value === "number" ? value : fallback;
}

function renderPartTabs(): string {
  return getPartSlots()
    .map((slot) => {
      const selected = slot === state.activeSlot ? "true" : "false";
      const selection = getSelection(slot);
      return `
        <button class="slot-tab" type="button" data-slot="${slot}" aria-pressed="${selected}">
          <span>${slot}</span>
          <small>${selection?.partId ?? "unset"}</small>
        </button>
      `;
    })
    .join("");
}

function renderRecipeButtons(): string {
  return CHARACTER_RECIPES.map((recipe) => {
    const active = Object.entries(recipe.parts).every(
      ([slot, partId]) => getSelection(slot as PartSlotKey)?.partId === partId
    )
      ? "true"
      : "false";

    return `
      <button class="recipe-button" type="button" data-recipe-id="${recipe.id}" aria-pressed="${active}">
        ${recipe.label}
      </button>
    `;
  }).join("");
}

function renderPartOptions(slot: PartSlotKey): string {
  const selection = getSelection(slot);

  return getCatalogEntries(slot)
    .map((item) => {
      const active = item.id === selection?.partId ? "true" : "false";
      const label = item.displayName ?? item.id;
      return `
        <button class="part-option" type="button" data-part-id="${item.id}" aria-pressed="${active}">
          <span>${label}</span>
          <small>${item.asset}</small>
        </button>
      `;
    })
    .join("");
}

function renderControls(slot: PartSlotKey): string {
  const selectedItem = getSelectedItem(slot);
  const editable = new Set(selectedItem?.editable ?? []);
  const transform = getMergedTransform(slot);
  const fields = NUMERIC_FIELDS.filter((field) => {
    if (field.key === "x" || field.key === "y") {
      return editable.has("position");
    }

    return editable.has(field.key);
  });
  const colorEditable = editable.has("color");

  return `
    <div class="control-stack">
      ${fields
        .map((field) => {
          const value = formatTransformValue(transform, field.key, field.fallback);
          return `
            <label class="range-row">
              <span>${field.label}</span>
              <input
                type="range"
                min="${field.min}"
                max="${field.max}"
                step="${field.step}"
                value="${value}"
                data-transform-key="${field.key}"
              />
              <output>${field.step < 1 ? value.toFixed(2) : value.toFixed(0)}</output>
            </label>
          `;
        })
        .join("")}
      ${
        colorEditable
          ? `
            <label class="color-row">
              <span>Color</span>
              <input type="text" value="${transform.color ?? ""}" data-transform-key="color" />
            </label>
          `
          : ""
      }
    </div>
  `;
}

function renderEmotionButtons(): string {
  return EMOTIONS.map((emotion) => {
    const active = emotion === state.emotion ? "true" : "false";
    return `<button type="button" data-emotion="${emotion}" aria-pressed="${active}">${emotion}</button>`;
  }).join("");
}

function renderExportButtons(): string {
  return `
    <button type="button" data-export="charpack">Export .charpack</button>
  `;
}

function renderApp(): void {
  const selectedItem = getSelectedItem(state.activeSlot);
  const selectedLabel = selectedItem?.displayName ?? selectedItem?.id ?? "No part";

  app.innerHTML = `
    <section class="topbar">
      <div>
        <p>Kugutu Studio</p>
        <h1>${state.character.character.displayName ?? state.character.character.id}</h1>
      </div>
      <div class="topbar-actions">
        <button class="secondary" type="button" id="blink-now">Blink</button>
      </div>
    </section>
    <section class="workspace">
      <aside class="sidebar">
        <section class="recipe-panel">
          <header>
            <span>Looks</span>
            <strong>${CHARACTER_RECIPES.length}</strong>
          </header>
          <div class="recipe-list">${renderRecipeButtons()}</div>
        </section>
        <header>
          <span>Parts</span>
          <strong>${getPartSlots().length}</strong>
        </header>
        <nav class="slot-list">${renderPartTabs()}</nav>
      </aside>
      <section class="stage" id="stage">
        <div class="preview-shell">
          <div id="studio-preview" class="preview"></div>
        </div>
      </section>
      <aside class="inspector">
        <header>
          <span>${state.activeSlot}</span>
          <strong>${selectedLabel}</strong>
        </header>
        <div class="part-options">${renderPartOptions(state.activeSlot)}</div>
        ${renderControls(state.activeSlot)}
        <section class="runtime-panel">
          <header>
            <span>Runtime</span>
            <strong>${buildCharacterBundle(state.character).runtime.api.length}</strong>
          </header>
          <div class="emotion-row">${renderEmotionButtons()}</div>
          <label class="range-row">
            <span>Mouth</span>
            <input type="range" min="0" max="1" step="0.01" value="${state.mouthOpen}" id="mouth-open" />
            <output>${state.mouthOpen.toFixed(2)}</output>
          </label>
        </section>
        <section class="export-panel">
          <header>
            <span>Export</span>
            <strong>${exportBaseName()}</strong>
          </header>
          <div class="export-row">${renderExportButtons()}</div>
        </section>
        <textarea id="source-readout" readonly spellcheck="false"></textarea>
      </aside>
    </section>
  `;

  bindEvents();
  renderPreview();
}

function bindEvents(): void {
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-slot]"))) {
    button.addEventListener("click", () => {
      const slot = button.dataset.slot;
      if (!slot) {
        return;
      }
      state.activeSlot = slot as PartSlotKey;
      renderApp();
    });
  }

  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-part-id]"))) {
    button.addEventListener("click", () => {
      const partId = button.dataset.partId;
      if (!partId) {
        return;
      }
      setPart(state.activeSlot, partId);
      renderApp();
    });
  }

  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-recipe-id]"))) {
    button.addEventListener("click", () => {
      const recipe = CHARACTER_RECIPES.find((item) => item.id === button.dataset.recipeId);
      if (!recipe) {
        return;
      }

      applyRecipe(recipe);
      renderApp();
    });
  }

  for (const input of Array.from(document.querySelectorAll<HTMLInputElement>("[data-transform-key]"))) {
    input.addEventListener("input", () => {
      const key = input.dataset.transformKey;
      if (!key) {
        return;
      }

      if (key === "color") {
        updateTransform(state.activeSlot, { color: input.value });
      } else {
        updateTransform(state.activeSlot, { [key]: Number(input.value) } as PartTransform);
      }

      renderApp();
    });
  }

  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-emotion]"))) {
    button.addEventListener("click", () => {
      state.emotion = button.dataset.emotion ?? "neutral";
      renderApp();
    });
  }

  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-export]"))) {
    button.addEventListener("click", () => {
      const exportKind = button.dataset.export;
      if (!exportKind || !isExportKind(exportKind)) {
        return;
      }
      exportArtifact(exportKind);
    });
  }

  document.querySelector<HTMLInputElement>("#mouth-open")?.addEventListener("input", (event) => {
    state.mouthOpen = Number((event.currentTarget as HTMLInputElement).value);
    player?.setMouthOpen(state.mouthOpen);
    renderApp();
  });

  document.querySelector<HTMLButtonElement>("#blink-now")?.addEventListener("click", () => {
    player?.playBehavior("blink-default");
  });

  document.querySelector<HTMLElement>("#stage")?.addEventListener("pointermove", (event) => {
    if (!player) {
      return;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    player.lookAt({ x, y });
  });

  document.querySelector<HTMLElement>("#stage")?.addEventListener("pointerleave", () => {
    player?.lookAt({ x: 0, y: 0 });
  });
}

function initializeStudio(initialPack: CharPack): void {
  baseSvgText = getInitialBaseSvg(initialPack);
  state = {
    character: getInitialCharacter(initialPack),
    activeSlot: "eye",
    emotion: "neutral",
    mouthOpen: 0.08,
  };
  renderApp();
}

function renderLoadError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  app.textContent = `Failed to load avatar.charpack: ${message}`;
  console.error(error);
}

loadInitialPack().then(initializeStudio).catch(renderLoadError);
