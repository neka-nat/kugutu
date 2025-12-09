import type {
  BehaviorType,
  CharBundle,
  CompiledBehavior,
  SlotKey,
} from "../../schema/src/index.js";

export interface LookAtPoint {
  x: number;
  y: number;
}

export interface EmotionState {
  name: string;
  intensity: number;
}

export interface CharacterPlayer {
  bundle: CharBundle;
  lookAt(point: LookAtPoint): void;
  playBehavior(id: string): void;
  setEmotion(name: string, intensity: number): void;
  setMouthOpen(value: number): void;
  step(deltaMs: number): void;
  start(): void;
  stop(): void;
  destroy(): void;
}

interface TransformState {
  translateX: number;
  translateY: number;
  rotateDeg: number;
  scaleX: number;
  scaleY: number;
}

interface BlinkState {
  phase: "idle" | "closing" | "opening";
  elapsedMs: number;
  nextBlinkMs: number;
  forced: boolean;
}

interface PlayerState {
  lookAt: LookAtPoint;
  mouthOpen: number;
  emotion: EmotionState;
  blink: BlinkState;
  breathingElapsedMs: number;
  rafId: number | null;
  lastFrameMs: number | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createNeutralTransform(): TransformState {
  return {
    translateX: 0,
    translateY: 0,
    rotateDeg: 0,
    scaleX: 1,
    scaleY: 1,
  };
}

function findBehavior(
  bundle: CharBundle,
  type: BehaviorType
): CompiledBehavior | undefined {
  return bundle.behaviors.find((behavior) => behavior.type === type);
}

function getBehaviorParam(
  behavior: CompiledBehavior | undefined,
  name: string,
  fallback: number
): number {
  const value = behavior?.params?.[name as never];
  return typeof value === "number" ? value : fallback;
}

function querySlotNodes(
  bundle: CharBundle,
  svgRoot: SVGSVGElement
): Map<SlotKey, SVGGraphicsElement> {
  const nodes = new Map<SlotKey, SVGGraphicsElement>();

  for (const [slotKey, binding] of Object.entries(bundle.bindings.slots) as [
    SlotKey,
    string,
  ][]) {
    const nodeId = binding.replace(/^transform\./, "").split(".")[0];
    if (!nodeId) {
      continue;
    }
    const node = svgRoot.querySelector<SVGGraphicsElement>(`#${CSS.escape(nodeId)}`);

    if (node) {
      node.style.transformBox = "fill-box";
      node.style.transformOrigin = "center";
      nodes.set(slotKey, node);
    }
  }

  return nodes;
}

function readNodeSize(node: SVGGraphicsElement): { width: number; height: number } {
  try {
    const box = node.getBBox();
    return {
      width: box.width || 100,
      height: box.height || 100,
    };
  } catch {
    return { width: 100, height: 100 };
  }
}

function applyCssTransform(node: SVGGraphicsElement, transform: TransformState): void {
  node.style.transform = [
    `translate(${transform.translateX}px, ${transform.translateY}px)`,
    `rotate(${transform.rotateDeg}deg)`,
    `scale(${transform.scaleX}, ${transform.scaleY})`,
  ].join(" ");
}

export function createCharacterPlayer(
  bundle: CharBundle,
  svgRoot: SVGSVGElement
): CharacterPlayer {
  const nodes = querySlotNodes(bundle, svgRoot);
  const transforms = new Map<SlotKey, TransformState>();

  const state: PlayerState = {
    lookAt: { x: 0, y: 0 },
    mouthOpen: 0,
    emotion: { name: "neutral", intensity: 0 },
    blink: {
      phase: "idle",
      elapsedMs: 0,
      nextBlinkMs: 2500,
      forced: false,
    },
    breathingElapsedMs: 0,
    rafId: null,
    lastFrameMs: null,
  };

  function ensureTransform(slotKey: SlotKey): TransformState {
    const existing = transforms.get(slotKey);
    if (existing) {
      return existing;
    }

    const neutral = createNeutralTransform();
    transforms.set(slotKey, neutral);
    return neutral;
  }

  function resetTransforms(): void {
    transforms.clear();
    for (const slotKey of nodes.keys()) {
      transforms.set(slotKey, createNeutralTransform());
    }
  }

  function translate(slotKey: SlotKey, x: number, y: number): void {
    const transform = ensureTransform(slotKey);
    transform.translateX += x;
    transform.translateY += y;
  }

  function rotate(slotKey: SlotKey, deg: number): void {
    const transform = ensureTransform(slotKey);
    transform.rotateDeg += deg;
  }

  function scaleY(slotKey: SlotKey, scale: number): void {
    const transform = ensureTransform(slotKey);
    transform.scaleY *= scale;
  }

  function applyLookAt(): void {
    const behavior = findBehavior(bundle, "look-at");
    if (!behavior) {
      return;
    }

    const radiusX = getBehaviorParam(behavior, "radiusX", 0.18);
    const radiusY = getBehaviorParam(behavior, "radiusY", 0.12);
    const headFollow = getBehaviorParam(behavior, "headFollow", 0.35);

    for (const slotKey of ["eye.l", "eye.r", "pupil.l", "pupil.r"] as const) {
      const node = nodes.get(slotKey);
      if (!node) {
        continue;
      }

      const size = readNodeSize(node);
      translate(slotKey, size.width * radiusX * state.lookAt.x, size.height * radiusY * state.lookAt.y);
    }

    for (const slotKey of ["head", "neck"] as const) {
      if (nodes.has(slotKey)) {
        rotate(slotKey, state.lookAt.x * headFollow * 12 + state.lookAt.y * headFollow * 4);
      }
    }
  }

  function updateBlink(deltaMs: number): number {
    const behavior = findBehavior(bundle, "blink");
    if (!behavior) {
      return 1;
    }

    const closeMs = getBehaviorParam(behavior, "closeMs", 120);
    const openMs = getBehaviorParam(behavior, "openMs", 140);
    const minIntervalMs = getBehaviorParam(behavior, "minIntervalMs", 2500);
    const maxIntervalMs = getBehaviorParam(behavior, "maxIntervalMs", 4500);

    if (state.blink.phase === "idle") {
      state.blink.nextBlinkMs -= deltaMs;
      if (state.blink.nextBlinkMs <= 0 || state.blink.forced) {
        state.blink.phase = "closing";
        state.blink.elapsedMs = 0;
        state.blink.forced = false;
      }
      return 1;
    }

    state.blink.elapsedMs += deltaMs;

    if (state.blink.phase === "closing") {
      const progress = clamp(state.blink.elapsedMs / closeMs, 0, 1);
      if (progress >= 1) {
        state.blink.phase = "opening";
        state.blink.elapsedMs = 0;
      }
      return 1 - progress * 0.9;
    }

    const progress = clamp(state.blink.elapsedMs / openMs, 0, 1);
    if (progress >= 1) {
      state.blink.phase = "idle";
      state.blink.elapsedMs = 0;
      state.blink.nextBlinkMs = (minIntervalMs + maxIntervalMs) / 2;
      return 1;
    }

    return 0.1 + progress * 0.9;
  }

  function applyBlink(deltaMs: number): void {
    const openness = updateBlink(deltaMs);

    for (const slotKey of ["eye.l", "eye.r"] as const) {
      if (nodes.has(slotKey)) {
        scaleY(slotKey, openness);
      }
    }
  }

  function applyBreathing(deltaMs: number): void {
    const behavior = findBehavior(bundle, "breathing");
    if (!behavior) {
      return;
    }

    state.breathingElapsedMs += deltaMs;

    const cycleMs = getBehaviorParam(behavior, "cycleMs", 3200);
    const amplitudeY = getBehaviorParam(behavior, "amplitudeY", 0.06);
    const torsoTiltDeg = getBehaviorParam(behavior, "torsoTiltDeg", 1.5);
    const wave = Math.sin((state.breathingElapsedMs / cycleMs) * Math.PI * 2);

    for (const slotKey of ["torso", "neck"] as const) {
      const node = nodes.get(slotKey);
      if (!node) {
        continue;
      }

      const size = readNodeSize(node);
      translate(slotKey, 0, size.height * amplitudeY * wave);
    }

    if (nodes.has("head")) {
      rotate("head", torsoTiltDeg * wave);
    }
  }

  function applyMouthOpen(): void {
    const behavior = findBehavior(bundle, "mouth-open");
    if (!behavior) {
      return;
    }

    const maxOpen = getBehaviorParam(behavior, "maxOpen", 0.9);
    const openness = 1 + clamp(state.mouthOpen, 0, 1) * maxOpen;

    for (const slotKey of ["mouth", "jaw"] as const) {
      if (nodes.has(slotKey)) {
        scaleY(slotKey, openness);
      }
    }
  }

  function applyEmotion(): void {
    const intensity = clamp(state.emotion.intensity, 0, 1);

    switch (state.emotion.name) {
      case "happy":
        if (nodes.has("brow.l")) {
          rotate("brow.l", -8 * intensity);
        }
        if (nodes.has("brow.r")) {
          rotate("brow.r", 8 * intensity);
        }
        if (nodes.has("mouth")) {
          scaleY("mouth", 1 + intensity * 0.12);
        }
        break;
      case "sad":
        if (nodes.has("brow.l")) {
          rotate("brow.l", 6 * intensity);
        }
        if (nodes.has("brow.r")) {
          rotate("brow.r", -6 * intensity);
        }
        break;
      case "angry":
        if (nodes.has("brow.l")) {
          rotate("brow.l", 10 * intensity);
        }
        if (nodes.has("brow.r")) {
          rotate("brow.r", -10 * intensity);
        }
        break;
      case "surprised":
        if (nodes.has("brow.l")) {
          translate("brow.l", 0, -6 * intensity);
        }
        if (nodes.has("brow.r")) {
          translate("brow.r", 0, -6 * intensity);
        }
        if (nodes.has("mouth")) {
          scaleY("mouth", 1 + intensity * 0.25);
        }
        break;
      default:
        break;
    }
  }

  function render(): void {
    for (const [slotKey, node] of nodes.entries()) {
      const transform = transforms.get(slotKey) ?? createNeutralTransform();
      applyCssTransform(node, transform);
    }
  }

  function step(deltaMs: number): void {
    resetTransforms();
    applyLookAt();
    applyBlink(deltaMs);
    applyBreathing(deltaMs);
    applyMouthOpen();
    applyEmotion();
    render();
  }

  function frame(timeMs: number): void {
    const lastFrameMs = state.lastFrameMs ?? timeMs;
    const deltaMs = timeMs - lastFrameMs;
    state.lastFrameMs = timeMs;
    step(deltaMs);
    state.rafId = requestAnimationFrame(frame);
  }

  return {
    bundle,
    lookAt(point: LookAtPoint): void {
      state.lookAt = {
        x: clamp(point.x, -1, 1),
        y: clamp(point.y, -1, 1),
      };
      step(0);
    },
    playBehavior(id: string): void {
      const behavior = bundle.behaviors.find((item) => item.id === id);
      if (behavior?.type === "blink") {
        state.blink.forced = true;
      }
      step(0);
    },
    setEmotion(name: string, intensity: number): void {
      state.emotion = { name, intensity: clamp(intensity, 0, 1) };
      step(0);
    },
    setMouthOpen(value: number): void {
      state.mouthOpen = clamp(value, 0, 1);
      step(0);
    },
    step,
    start(): void {
      if (state.rafId !== null) {
        return;
      }

      state.lastFrameMs = null;
      state.rafId = requestAnimationFrame(frame);
    },
    stop(): void {
      if (state.rafId !== null) {
        cancelAnimationFrame(state.rafId);
        state.rafId = null;
      }
    },
    destroy(): void {
      this.stop();
      for (const node of nodes.values()) {
        node.style.transform = "";
      }
    },
  };
}
