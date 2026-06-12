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

// Curated swatches per slot so color editing feels like picking from a Mii-style
// palette instead of typing a hex code. Falls back to DEFAULT_PALETTE.
const SKIN_PALETTE = [
  "#ffe0c4", "#f8d2ad", "#f1bd95", "#e0a878", "#c68a5e", "#9c6644", "#6f4a2f",
];
const HAIR_PALETTE = [
  "#1c1a18", "#3b2a20", "#6b4423", "#a86b35", "#d8a25a", "#e8c887",
  "#b03a2e", "#c0392b", "#7d5fb2", "#2e7d6b", "#cfd2d6", "#f4f1ea",
];
const DEFAULT_PALETTE = [
  "#167c80", "#c65d45", "#b88319", "#3a5fb0", "#2e7d4f", "#7d5fb2",
  "#d65b8a", "#2d3436", "#8a8d91", "#e8e1d4", "#fffdf8", "#1c1a18",
];

const COLOR_PALETTES: Partial<Record<PartSlotKey, string[]>> = {
  face: SKIN_PALETTE,
  nose: SKIN_PALETTE,
  "hair.front": HAIR_PALETTE,
  "hair.back": HAIR_PALETTE,
  brow: HAIR_PALETTE,
  eye: ["#3b2a20", "#6b4423", "#1f6f78", "#2e7d4f", "#3a5fb0", "#7d3fb2", "#8a8d91", "#1c1a18"],
  mouth: ["#c0392b", "#d65b4a", "#e08a7a", "#b8556b", "#9c4f57", "#7a3b3b"],
  outfit: [
    "#167c80", "#c65d45", "#b88319", "#3a5fb0", "#2e7d4f", "#7d5fb2",
    "#d65b8a", "#2d3436", "#e8e1d4", "#f4f1ea",
  ],
};

function getPalette(slot: PartSlotKey): string[] {
  return COLOR_PALETTES[slot] ?? DEFAULT_PALETTE;
}

// Native <input type="color"> only accepts 6-digit hex. Coerce shorthand/None
// into something it will display without throwing away the authored value.
function toPickerHex(color: string | undefined): string {
  if (!color) {
    return "#cccccc";
  }

  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color);
  if (short) {
    return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  }

  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#cccccc";
}

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
let partAssets: Record<string, string> = {};

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

function updateTransform(slot: PartSlotKey, patch: PartTransform): void {
  const selection = ensureSelection(slot);
  selection.transform = {
    ...(selection.transform ?? {}),
    ...patch,
  };
}

function clearTransformKey(slot: PartSlotKey, key: keyof PartTransform): void {
  const selection = getSelection(slot);
  if (selection?.transform) {
    delete selection.transform[key];
  }
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
  const svgText = composeCharacterSvg(characterDocument, baseSvgText, { partAssets });
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
    `${JSON.stringify(buildCharacterPack(characterDocument, baseSvgText, { partAssets }), null, 2)}\n`,
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

const PART_PREVIEW_VIEWBOX: Record<PartSlotKey, string> = {
  face: "-96 -96 192 192",
  "hair.front": "-96 -96 192 150",
  "hair.back": "-96 -96 192 230",
  eye: "-22 -22 44 44",
  brow: "-20 -18 40 32",
  nose: "-13 -14 26 28",
  mouth: "-20 -16 40 36",
  outfit: "-80 -40 160 90",
};

function renderPartThumb(slot: PartSlotKey, partId: string): string {
  const fragment = partAssets[partId] ?? "";
  const hasArt = /<(path|circle|ellipse|rect|polygon|polyline|line)\b/i.test(fragment);

  if (!hasArt) {
    return `<span class="part-thumb part-thumb-empty">None</span>`;
  }

  const viewBox = PART_PREVIEW_VIEWBOX[slot] ?? "-96 -96 192 192";
  return `<svg class="part-thumb" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${fragment}</svg>`;
}

function renderPartOptions(slot: PartSlotKey): string {
  const selection = getSelection(slot);

  return getCatalogEntries(slot)
    .map((item) => {
      const active = item.id === selection?.partId ? "true" : "false";
      const label = item.displayName ?? item.id;
      return `
        <button class="part-option" type="button" data-part-id="${item.id}" aria-pressed="${active}">
          ${renderPartThumb(slot, item.id)}
          <span>${label}</span>
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
      ${colorEditable ? renderColorControl(slot, transform) : ""}
    </div>
  `;
}

function renderColorControl(slot: PartSlotKey, transform: PartTransform): string {
  const current = transform.color?.toLowerCase();
  const swatches = getPalette(slot)
    .map((color) => {
      const active = color.toLowerCase() === current ? "true" : "false";
      return `
        <button
          type="button"
          class="swatch"
          style="--swatch:${color}"
          data-color-swatch="${color}"
          aria-pressed="${active}"
          title="${color}"
          aria-label="色 ${color}"
        ></button>
      `;
    })
    .join("");

  return `
    <div class="color-control">
      <div class="color-control-head">
        <span>Color</span>
        <span class="color-current">${transform.color ?? "default"}</span>
      </div>
      <div class="swatch-grid">
        ${swatches}
        <label class="swatch swatch-custom" title="カスタム色" aria-label="カスタム色">
          <input type="color" value="${toPickerHex(transform.color)}" data-color-picker />
        </label>
        <button
          type="button"
          class="swatch swatch-reset"
          data-color-reset
          aria-pressed="${current ? "false" : "true"}"
          title="デフォルトに戻す"
          aria-label="デフォルトに戻す"
        >⟲</button>
      </div>
    </div>
  `;
}

function renderEmotionButtons(): string {
  return EMOTIONS.map((emotion) => {
    const active = emotion === state.emotion ? "true" : "false";
    return `<button type="button" data-emotion="${emotion}" aria-pressed="${active}">${emotion}</button>`;
  }).join("");
}

function renderGestureButtons(): string {
  const gestures = buildCharacterBundle(state.character).gestures ?? [];
  if (gestures.length === 0) {
    return `<p class="gesture-empty">No gestures for this character.</p>`;
  }

  return gestures
    .map((gesture) => `<button type="button" data-gesture="${gesture.id}">${gesture.id}</button>`)
    .join("");
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
          <p class="panel-subhead">Gestures</p>
          <div class="gesture-row">${renderGestureButtons()}</div>
          <div class="word-row">
            <input type="text" id="gesture-word" placeholder="言葉で再生 (例: ありがとう / 了解 / NG)" />
            <button type="button" id="gesture-word-go">react</button>
          </div>
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

  for (const input of Array.from(document.querySelectorAll<HTMLInputElement>("[data-transform-key]"))) {
    input.addEventListener("input", () => {
      const key = input.dataset.transformKey;
      if (!key) {
        return;
      }

      updateTransform(state.activeSlot, { [key]: Number(input.value) } as PartTransform);
      renderApp();
    });
  }

  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-color-swatch]"))) {
    button.addEventListener("click", () => {
      const color = button.dataset.colorSwatch;
      if (!color) {
        return;
      }
      updateTransform(state.activeSlot, { color });
      renderApp();
    });
  }

  document.querySelector<HTMLButtonElement>("[data-color-reset]")?.addEventListener("click", () => {
    clearTransformKey(state.activeSlot, "color");
    renderApp();
  });

  // Live-update the preview while dragging the native picker, but only commit a
  // full re-render on `change` — rebuilding the DOM mid-drag closes the picker.
  const colorPicker = document.querySelector<HTMLInputElement>("[data-color-picker]");
  colorPicker?.addEventListener("input", () => {
    updateTransform(state.activeSlot, { color: colorPicker.value });
    renderPreview();
  });
  colorPicker?.addEventListener("change", () => {
    renderApp();
  });

  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-emotion]"))) {
    button.addEventListener("click", () => {
      state.emotion = button.dataset.emotion ?? "neutral";
      renderApp();
    });
  }

  // Gesture buttons play on the live player without re-rendering (which would
  // destroy and recreate the player, cutting the gesture short).
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-gesture]"))) {
    button.addEventListener("click", () => {
      const id = button.dataset.gesture;
      if (id) {
        player?.playGesture(id);
      }
    });
  }

  const wordInput = document.querySelector<HTMLInputElement>("#gesture-word");
  const wordGo = document.querySelector<HTMLButtonElement>("#gesture-word-go");
  const reactToWord = (): void => {
    if (!wordInput) {
      return;
    }
    const matched = player?.playGestureForText(wordInput.value) ?? null;
    if (wordGo) {
      wordGo.textContent = matched ? `▶ ${matched}` : "no match";
      window.setTimeout(() => {
        wordGo.textContent = "react";
      }, 1200);
    }
  };
  wordGo?.addEventListener("click", reactToWord);
  wordInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      reactToWord();
    }
  });

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
  partAssets = initialPack.partAssets ?? {};
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
