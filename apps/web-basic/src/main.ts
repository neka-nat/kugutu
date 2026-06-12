import { Kugutu } from "@kugutu/runtime-web";
import type { CharBundle, PartSlotKey } from "@kugutu/schema";

function formatRuntimeSummary(bundle: CharBundle): string {
  const behaviorList = bundle.behaviors.map((behavior) => behavior.id).join("\n");
  const apiList = bundle.runtime.api.join(", ");
  const slotCount = Object.keys(bundle.bindings.slots).length;

  return [
    `character: ${bundle.character.id}`,
    `template: ${bundle.character.template}`,
    `slots: ${slotCount}`,
    `api: ${apiList}`,
    "",
    "behaviors:",
    behaviorList,
  ].join("\n");
}

function setActiveEmotion(buttons: HTMLButtonElement[], emotion: string): void {
  for (const button of buttons) {
    button.classList.toggle("active", button.dataset.emotion === emotion);
  }
}

function groupCatalogBySlot(
  bundle: CharBundle
): Map<PartSlotKey, { id: string; label: string }[]> {
  const grouped = new Map<PartSlotKey, { id: string; label: string }[]>();

  for (const item of Object.values(bundle.parts?.catalog ?? {})) {
    const entries = grouped.get(item.slot) ?? [];
    entries.push({ id: item.id, label: item.displayName ?? item.id });
    grouped.set(item.slot, entries);
  }

  return grouped;
}

function renderPartsPanel(
  panel: HTMLElement,
  bundle: CharBundle,
  getActive: (slot: PartSlotKey) => string | undefined,
  onPick: (slot: PartSlotKey, partId: string) => void
): void {
  panel.replaceChildren();
  const grouped = groupCatalogBySlot(bundle);

  for (const [slot, options] of grouped) {
    if (options.length < 2) {
      continue;
    }

    const label = document.createElement("label");
    label.textContent = slot;

    const row = document.createElement("div");
    row.className = "row";

    for (const option of options) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = option.label;
      button.dataset.slot = slot;
      button.dataset.partId = option.id;
      button.classList.toggle("active", getActive(slot) === option.id);
      button.addEventListener("click", () => {
        onPick(slot, option.id);
        for (const sibling of Array.from(row.children)) {
          sibling.classList.toggle(
            "active",
            (sibling as HTMLElement).dataset.partId === option.id
          );
        }
      });
      row.append(button);
    }

    panel.append(label, row);
  }
}

async function main(): Promise<void> {
  const frame = document.querySelector<HTMLElement>("#character-frame");
  const stage = document.querySelector<HTMLElement>("#stage");
  const blinkButton = document.querySelector<HTMLButtonElement>("#blink-now");
  const centerButton = document.querySelector<HTMLButtonElement>("#look-center");
  const mouthOpenInput = document.querySelector<HTMLInputElement>("#mouth-open");
  const mouthOpenValue = document.querySelector<HTMLElement>("#mouth-open-value");
  const speakButton = document.querySelector<HTMLButtonElement>("#speak-sample");
  const bundleReadout = document.querySelector<HTMLElement>("#bundle-readout");
  const partsPanel = document.querySelector<HTMLElement>("#parts-panel");
  const gesturePanel = document.querySelector<HTMLElement>("#gesture-panel");
  const emotionButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("#emotion-buttons button[data-emotion]")
  );

  if (
    !frame ||
    !stage ||
    !blinkButton ||
    !centerButton ||
    !mouthOpenInput ||
    !mouthOpenValue ||
    !bundleReadout ||
    !partsPanel ||
    !gesturePanel ||
    !speakButton
  ) {
    throw new Error("Demo markup is incomplete");
  }

  // One-line actor load: fetch the .charpack, mount it, and start it.
  const player = await Kugutu.load(`${import.meta.env.BASE_URL}avatar.charpack`, frame);

  bundleReadout.textContent = formatRuntimeSummary(player.bundle);
  renderPartsPanel(
    partsPanel,
    player.bundle,
    (slot) => player.getPart(slot),
    (slot, partId) => player.setPart(slot, partId)
  );

  for (const gesture of player.bundle.gestures) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = gesture.id;
    button.addEventListener("click", () => player.playGesture(gesture.id));
    gesturePanel.append(button);
  }

  setActiveEmotion(emotionButtons, "neutral");
  player.setEmotion("neutral", 0);
  player.setMouthOpen(Number(mouthOpenInput.value));

  stage.addEventListener("pointermove", (event) => {
    const rect = stage.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    player.lookAt({ x, y });
  });

  stage.addEventListener("pointerleave", () => {
    player.lookAt({ x: 0, y: 0 });
  });

  blinkButton.addEventListener("click", () => {
    player.playBehavior("blink-default");
  });

  centerButton.addEventListener("click", () => {
    player.lookAt({ x: 0, y: 0 });
  });

  mouthOpenInput.addEventListener("input", () => {
    const value = Number(mouthOpenInput.value);
    mouthOpenValue.textContent = value.toFixed(2);
    player.setMouthOpen(value);
  });

  // A short canned viseme stream, the way a TTS engine would emit cue timings.
  const sampleVisemes = ["PP", "aa", "nn", "E", "kk", "U", "O", "aa", "I", "sil"];
  const sampleCues = sampleVisemes.map((viseme, index) => ({
    viseme,
    startMs: index * 120,
    endMs: index * 120 + 110,
  }));
  speakButton.addEventListener("click", () => {
    player.speak(sampleCues);
  });

  for (const button of emotionButtons) {
    button.addEventListener("click", () => {
      const emotion = button.dataset.emotion ?? "neutral";
      setActiveEmotion(emotionButtons, emotion);

      const intensityMap: Record<string, number> = {
        neutral: 0,
        happy: 0.7,
        sad: 0.65,
        angry: 0.7,
        surprised: 0.8,
      };

      player.setEmotion(emotion, intensityMap[emotion] ?? 0.45);
    });
  }
}

main().catch((error: unknown) => {
  console.error(error);
});
