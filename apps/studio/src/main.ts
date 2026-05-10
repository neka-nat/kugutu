import { buildCharacterBundle, composeCharacterSvg } from "../../../packages/compiler/src/index.js";
import { createCharacterPlayer, type CharacterPlayer } from "../../../packages/runtime-web/src/index.js";
import type {
  CharacterDefinition,
  CharacterPartCatalogItem,
  CharacterPartSelection,
  PartSlotKey,
  PartTransform,
} from "../../../packages/schema/src/index.js";

import baseSvgText from "../../web-basic/source/avatar.base.svg?raw";
import characterJsonText from "../../web-basic/source/avatar-lite.character.json?raw";

import "./styles.css";

type NumericTransformKey =
  | "x"
  | "y"
  | "scale"
  | "rotation"
  | "spacing"
  | "layer";

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

const root = document.querySelector<HTMLElement>("#app");
if (!root) {
  throw new Error("Studio root not found.");
}
const app: HTMLElement = root;

const state: StudioState = {
  character: JSON.parse(characterJsonText) as CharacterDefinition,
  activeSlot: "eye",
  emotion: "neutral",
  mouthOpen: 0.08,
};

let player: CharacterPlayer | null = null;

function cloneCharacter(document: CharacterDefinition): CharacterDefinition {
  return JSON.parse(JSON.stringify(document)) as CharacterDefinition;
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
  state.character.parts.selections[slot] = {
    partId,
    transform: {
      ...(item.defaults ?? {}),
      ...(current?.transform ?? {}),
    },
  };
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

function renderApp(): void {
  const selectedItem = getSelectedItem(state.activeSlot);
  const selectedLabel = selectedItem?.displayName ?? selectedItem?.id ?? "No part";

  app.innerHTML = `
    <section class="topbar">
      <div>
        <p>Kugutu Studio</p>
        <h1>${state.character.character.displayName ?? state.character.character.id}</h1>
      </div>
      <button class="secondary" type="button" id="blink-now">Blink</button>
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

renderApp();
