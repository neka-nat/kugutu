import {
  createElement,
  useEffect,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";
import { createRoot } from "react-dom/client";

import {
  KugutuCharacterPack,
  type CharacterPlayer,
} from "@kugutu/react";
import type { CharPack } from "@kugutu/schema";

import "./styles.css";

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function emotionIntensity(emotion: string): number {
  const values: Record<string, number> = {
    neutral: 0,
    happy: 0.55,
    sad: 0.4,
    angry: 0.55,
    surprised: 0.75,
  };

  return values[emotion] ?? 0.45;
}

function App(): ReactElement {
  const [pack, setPack] = useState<CharPack | null>(null);
  const [player, setPlayer] = useState<CharacterPlayer | null>(null);
  const [emotion, setEmotion] = useState("neutral");
  const [mouthOpen, setMouthOpen] = useState(0.08);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<CharPack>(`${import.meta.env.BASE_URL}avatar.charpack`)
      .then((nextPack) => {
        setPack(nextPack);
        setError(null);
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      });
  }, []);

  useEffect(() => {
    player?.setEmotion(emotion, emotionIntensity(emotion));
  }, [emotion, player]);

  useEffect(() => {
    player?.setMouthOpen(mouthOpen);
  }, [mouthOpen, player]);

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>): void {
    if (!player) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    player.lookAt({ x, y });
  }

  function handlePointerLeave(): void {
    player?.lookAt({ x: 0, y: 0 });
  }

  const emotionButtons = ["neutral", "happy", "sad", "angry", "surprised"].map(
    (item) =>
      createElement(
        "button",
        {
          key: item,
          className: item === emotion ? "active" : "",
          type: "button",
          onClick: () => setEmotion(item),
        },
        item
      )
  );

  return createElement(
    "main",
    null,
    createElement(
      "section",
      {
        className: "stage",
        onPointerMove: handlePointerMove,
        onPointerLeave: handlePointerLeave,
      },
      pack
        ? createElement(KugutuCharacterPack, {
            pack,
            className: "character",
            onPlayerReady: setPlayer,
          })
        : createElement("div", { className: "loading" }, error ?? "Loading character...")
    ),
    createElement(
      "aside",
      { className: "controls" },
      createElement("h1", null, "React Basic"),
      createElement(
        "p",
        null,
        "A React wrapper driving the same Kugutu actor API used by the web runtime."
      ),
      createElement("section", null, createElement("h2", null, "Emotion"), createElement("div", { className: "row" }, emotionButtons)),
      createElement(
        "section",
        null,
        createElement("h2", null, "Speech"),
        createElement("input", {
          type: "range",
          min: 0,
          max: 1,
          step: 0.01,
          value: mouthOpen,
          onChange: (event) => setMouthOpen(Number(event.currentTarget.value)),
        }),
        createElement("output", null, mouthOpen.toFixed(2))
      ),
      createElement(
        "section",
        null,
        createElement("h2", null, "Action"),
        createElement(
          "button",
          {
            className: "primary",
            type: "button",
            onClick: () => player?.playBehavior("blink-default"),
          },
          "Blink"
        )
      )
    )
  );
}

const root = document.querySelector("#root");
if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(createElement(App));
