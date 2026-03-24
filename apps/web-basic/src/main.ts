import { createCharacterPlayer } from "../../../packages/runtime-web/src/index.js";
import type { CharBundle } from "../../../packages/schema/src/index.js";

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

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

async function main(): Promise<void> {
  const frame = document.querySelector<HTMLElement>("#character-frame");
  const stage = document.querySelector<HTMLElement>("#stage");
  const blinkButton = document.querySelector<HTMLButtonElement>("#blink-now");
  const centerButton = document.querySelector<HTMLButtonElement>("#look-center");
  const mouthOpenInput = document.querySelector<HTMLInputElement>("#mouth-open");
  const mouthOpenValue = document.querySelector<HTMLElement>("#mouth-open-value");
  const bundleReadout = document.querySelector<HTMLElement>("#bundle-readout");
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
    !bundleReadout
  ) {
    throw new Error("Demo markup is incomplete");
  }

  const [svgText, bundle] = await Promise.all([
    fetchText(`${import.meta.env.BASE_URL}avatar.svg`),
    fetchJson<CharBundle>(`${import.meta.env.BASE_URL}avatar-lite.charbundle.json`),
  ]);

  frame.innerHTML = svgText;
  const svgRoot = frame.querySelector<SVGSVGElement>("svg");

  if (!svgRoot) {
    throw new Error("SVG root not found in demo asset");
  }

  bundleReadout.textContent = formatRuntimeSummary(bundle);

  const player = createCharacterPlayer(bundle, svgRoot);
  setActiveEmotion(emotionButtons, "neutral");
  player.setEmotion("neutral", 0);
  player.setMouthOpen(Number(mouthOpenInput.value));
  player.start();

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

  for (const button of emotionButtons) {
    button.addEventListener("click", () => {
      const emotion = button.dataset.emotion ?? "neutral";
      setActiveEmotion(emotionButtons, emotion);

      const intensityMap: Record<string, number> = {
        neutral: 0,
        happy: 0.55,
        sad: 0.4,
        angry: 0.55,
        surprised: 0.75,
      };

      player.setEmotion(emotion, intensityMap[emotion] ?? 0.45);
    });
  }
}

main().catch((error: unknown) => {
  console.error(error);
});
