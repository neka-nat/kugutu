import {
  createElement,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";

import {
  createCharacterPlayer,
  createCharacterPlayerFromPack,
  type CharacterPlayer,
} from "@kugutu/runtime-web";
import type { CharBundle, CharPack } from "@kugutu/schema";

export type { CharacterPlayer, LookAtPoint } from "@kugutu/runtime-web";

export interface KugutuCharacterProps {
  bundle: CharBundle;
  svgText?: string;
  svgUrl?: string;
  autoStart?: boolean;
  className?: string;
  style?: CSSProperties;
  onPlayerReady?: (player: CharacterPlayer | null) => void;
}

export interface KugutuCharacterPackProps {
  pack: CharPack;
  autoStart?: boolean;
  className?: string;
  style?: CSSProperties;
  onPlayerReady?: (player: CharacterPlayer | null) => void;
}

async function fetchSvg(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

export function KugutuCharacter({
  bundle,
  svgText,
  svgUrl,
  autoStart = true,
  className,
  style,
  onPlayerReady,
}: KugutuCharacterProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<CharacterPlayer | null>(null);
  const onPlayerReadyRef = useRef(onPlayerReady);
  const [resolvedSvgText, setResolvedSvgText] = useState(svgText ?? "");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    onPlayerReadyRef.current = onPlayerReady;
  }, [onPlayerReady]);

  useEffect(() => {
    let cancelled = false;

    if (svgText !== undefined) {
      setResolvedSvgText(svgText);
      setLoadError(null);
      return undefined;
    }

    if (!svgUrl) {
      setResolvedSvgText("");
      setLoadError("KugutuCharacter requires svgText or svgUrl.");
      return undefined;
    }

    fetchSvg(svgUrl)
      .then((text) => {
        if (!cancelled) {
          setResolvedSvgText(text);
          setLoadError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [svgText, svgUrl]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    playerRef.current?.destroy();
    playerRef.current = null;
    onPlayerReadyRef.current?.(null);

    if (!resolvedSvgText) {
      container.textContent = loadError ?? "";
      return undefined;
    }

    container.innerHTML = resolvedSvgText;

    const svgRoot = container.querySelector<SVGSVGElement>("svg");
    if (!svgRoot) {
      setLoadError("SVG root not found.");
      return undefined;
    }

    const player = createCharacterPlayer(bundle, svgRoot);
    playerRef.current = player;
    onPlayerReadyRef.current?.(player);

    if (autoStart) {
      player.start();
    }

    return () => {
      onPlayerReadyRef.current?.(null);
      player.destroy();
      if (playerRef.current === player) {
        playerRef.current = null;
      }
    };
  }, [autoStart, bundle, loadError, resolvedSvgText]);

  return createElement("div", {
    ref: containerRef,
    className,
    style,
    "data-kugutu-error": loadError ?? undefined,
  });
}

export function KugutuCharacterPack({
  pack,
  autoStart = true,
  className,
  style,
  onPlayerReady,
}: KugutuCharacterPackProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<CharacterPlayer | null>(null);
  const onPlayerReadyRef = useRef(onPlayerReady);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    onPlayerReadyRef.current = onPlayerReady;
  }, [onPlayerReady]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    playerRef.current?.destroy();
    playerRef.current = null;
    onPlayerReadyRef.current?.(null);

    try {
      const player = createCharacterPlayerFromPack(pack, container, { autoStart });
      playerRef.current = player;
      setLoadError(null);
      onPlayerReadyRef.current?.(player);

      return () => {
        onPlayerReadyRef.current?.(null);
        player.destroy();
        if (playerRef.current === player) {
          playerRef.current = null;
        }
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setLoadError(message);
      container.textContent = message;
      return undefined;
    }
  }, [autoStart, pack]);

  return createElement("div", {
    ref: containerRef,
    className,
    style,
    "data-kugutu-error": loadError ?? undefined,
  });
}
