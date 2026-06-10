import {
  KUGUTU_PIVOT_ATTR,
  PART_SLOT_DEFINITIONS,
  composeAnchorPartTransform,
  composePartNodeTransform,
  resolvePartTransform,
  type BehaviorType,
  type CharBundle,
  type CharPack,
  type CharacterPartSelection,
  type CompiledBehavior,
  type GestureKeyframe,
  type PartSlotKey,
  type PartTransform,
  type SlotKey,
} from "@kugutu/schema";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface LookAtPoint {
  x: number;
  y: number;
}

/**
 * A single timed lip-sync cue. `startMs`/`endMs` are relative to the `speak()`
 * call (matching how TTS engines emit viseme events by audio offset). When
 * `endMs` is omitted it runs until the next cue starts.
 */
export interface VisemeCue {
  viseme: string;
  startMs: number;
  endMs?: number;
}

export interface SpeakOptions {
  loop?: boolean;
}

export interface EmotionState {
  name: string;
  intensity: number;
}

export interface CharacterPlayer {
  bundle: CharBundle;
  lookAt(point: LookAtPoint): void;
  playBehavior(id: string): void;
  /** Play a named, time-based gesture once (or looped if the gesture sets `loop`). */
  playGesture(id: string): void;
  setEmotion(name: string, intensity: number): void;
  setMouthOpen(value: number): void;
  /** Drive viseme-based lip-sync from a sequence of timed cues. */
  speak(cues: VisemeCue[], options?: SpeakOptions): void;
  /** Stop any active lip-sync and close the mouth. */
  stopSpeaking(): void;
  /** Switch the active part for a part slot (e.g. `setPart("eye", "eye-round-01")`). */
  setPart(partSlot: PartSlotKey, partId: string): void;
  /** Alias of {@link CharacterPlayer.setPart} for variant-style swaps (outfits, seasons). */
  setVariant(partSlot: PartSlotKey, partId: string): void;
  /** Adjust the live transform (position/scale/rotation/spacing/color) of a part slot. */
  tunePart(partSlot: PartSlotKey, transform: PartTransform): void;
  /** Returns the part id currently selected for a part slot. */
  getPart(partSlot: PartSlotKey): string | undefined;
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

interface GestureState {
  id: string;
  elapsedMs: number;
}

interface ResolvedCue {
  viseme: string;
  startMs: number;
  endMs: number;
}

interface SpeakingState {
  cues: ResolvedCue[];
  endMs: number;
  tailMs: number;
  elapsedMs: number;
  loop: boolean;
  open: number;
  width: number;
}

interface PlayerState {
  lookAt: LookAtPoint;
  mouthOpen: number;
  emotion: EmotionState;
  blink: BlinkState;
  breathingElapsedMs: number;
  gesture: GestureState | null;
  speaking: SpeakingState | null;
  rafId: number | null;
  lastFrameMs: number | null;
}

interface GestureOffsets {
  translateX: number;
  translateY: number;
  rotate: number;
  scaleX: number;
  scaleY: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Linearly samples a sorted keyframe track at normalized time `t` (0..1). */
function sampleGestureTrack(
  keyframes: GestureKeyframe[],
  t: number
): GestureOffsets {
  const read = (frame: GestureKeyframe): GestureOffsets => ({
    translateX: frame.translateX ?? 0,
    translateY: frame.translateY ?? 0,
    rotate: frame.rotate ?? 0,
    scaleX: frame.scaleX ?? 0,
    scaleY: frame.scaleY ?? 0,
  });

  if (keyframes.length === 0) {
    return { translateX: 0, translateY: 0, rotate: 0, scaleX: 0, scaleY: 0 };
  }

  const first = keyframes[0]!;
  const last = keyframes[keyframes.length - 1]!;
  if (t <= first.t) {
    return read(first);
  }
  if (t >= last.t) {
    return read(last);
  }

  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const prev = keyframes[index]!;
    const next = keyframes[index + 1]!;
    if (t >= prev.t && t <= next.t) {
      const span = next.t - prev.t;
      const f = span > 0 ? (t - prev.t) / span : 0;
      const a = read(prev);
      const b = read(next);
      return {
        translateX: lerp(a.translateX, b.translateX, f),
        translateY: lerp(a.translateY, b.translateY, f),
        rotate: lerp(a.rotate, b.rotate, f),
        scaleX: lerp(a.scaleX, b.scaleX, f),
        scaleY: lerp(a.scaleY, b.scaleY, f),
      };
    }
  }

  return read(last);
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

/**
 * Sets the CSS rotation/scale pivot for a slot node. Joints (arms) carry a
 * `data-kugutu-pivot` marker as a direct child so they rotate around the
 * shoulder/elbow/wrist rather than their bounding-box center; everything else
 * (and any node whose pivot can't be measured) falls back to center.
 */
function applySlotPivot(node: SVGGraphicsElement): void {
  node.style.transformBox = "fill-box";
  node.style.transformOrigin = "center";

  const marker = node.querySelector<SVGGraphicsElement>(
    `:scope > [${KUGUTU_PIVOT_ATTR}]`
  );
  if (!marker) {
    return;
  }

  try {
    // Marker is an untransformed direct child, so its bbox is already in the
    // joint's local user space — the same space `node.getBBox()` reports.
    const pivot = marker.getBBox();
    const pivotX = pivot.x + pivot.width / 2;
    const pivotY = pivot.y + pivot.height / 2;

    // Hide the marker before measuring the joint so it never affects the bbox
    // (or renders).
    marker.style.display = "none";

    const box = node.getBBox();
    if (box.width === 0 || box.height === 0) {
      return;
    }

    // `transform-box: fill-box` makes transform-origin lengths offsets from the
    // top-left of the joint's bbox, in local user units.
    node.style.transformOrigin = `${pivotX - box.x}px ${pivotY - box.y}px`;
  } catch {
    // getBBox throws in non-rendering/headless DOM stubs — keep center.
  }
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
      applySlotPivot(node);
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
    gesture: null,
    speaking: null,
    rafId: null,
    lastFrameMs: null,
  };

  const partSelections: Record<string, CharacterPartSelection> = bundle.parts
    ? (JSON.parse(JSON.stringify(bundle.parts.selections)) as Record<
        string,
        CharacterPartSelection
      >)
    : {};
  const partCatalog = bundle.parts?.catalog ?? {};
  const runtimeColors = new Map<string, string>();

  function escapeCssAttrValue(value: string): string {
    return value.replace(/["\\]/g, "\\$&");
  }

  function applyVariantVisibility(partSlot: PartSlotKey, partId: string): boolean {
    const groups = svgRoot.querySelectorAll<SVGGraphicsElement>(
      `[data-kugutu-variant-slot="${escapeCssAttrValue(partSlot)}"]`
    );

    let matched = false;
    for (const group of groups) {
      if (group.getAttribute("data-kugutu-variant-id") === partId) {
        matched = true;
      }
    }

    if (!matched) {
      return false;
    }

    for (const group of groups) {
      const isActive = group.getAttribute("data-kugutu-variant-id") === partId;
      group.style.display = isActive ? "inline" : "none";
    }

    return true;
  }

  function ensurePartWrapper(
    nodeId: string,
    partSlot: PartSlotKey
  ): SVGGraphicsElement | null {
    const existing = svgRoot.querySelector<SVGGraphicsElement>(
      `[data-kugutu-part-node="${escapeCssAttrValue(nodeId)}"]`
    );
    if (existing) {
      return existing;
    }

    const node = svgRoot.querySelector<SVGGraphicsElement>(`#${CSS.escape(nodeId)}`);
    if (!node?.parentNode) {
      return null;
    }

    const wrapper = document.createElementNS(SVG_NS, "g") as unknown as SVGGraphicsElement;
    wrapper.setAttribute("data-kugutu-part-slot", partSlot);
    wrapper.setAttribute("data-kugutu-part-node", nodeId);
    node.parentNode.insertBefore(wrapper, node);
    wrapper.appendChild(node);
    return wrapper;
  }

  function rebuildRuntimeStyle(): void {
    let style = svgRoot.querySelector<SVGStyleElement>("#kugutu-runtime-style");
    if (!style) {
      style = document.createElementNS(SVG_NS, "style") as SVGStyleElement;
      style.id = "kugutu-runtime-style";
      svgRoot.appendChild(style);
    }

    const rules: string[] = [];
    for (const [nodeId, color] of runtimeColors.entries()) {
      const selector = `[data-kugutu-part-color="${escapeCssAttrValue(nodeId)}"]`;
      rules.push(`${selector} [fill]:not([fill="none"]) { fill: ${color}; }`);
      rules.push(`${selector} [stroke]:not([stroke="none"]) { stroke: ${color}; }`);
    }

    style.textContent = rules.join("\n");
  }

  function applyAnchorPartAppearance(
    partSlot: PartSlotKey,
    partId: string,
    transform: PartTransform,
    color: string | undefined
  ): void {
    const paired = PART_SLOT_DEFINITIONS[partSlot]?.paired ?? false;
    const transformValue = composeAnchorPartTransform(paired, transform);
    const groups = svgRoot.querySelectorAll<SVGGraphicsElement>(
      `[data-kugutu-variant-slot="${escapeCssAttrValue(partSlot)}"][data-kugutu-variant-id="${escapeCssAttrValue(partId)}"]`
    );

    for (const group of groups) {
      if (transformValue) {
        group.setAttribute("transform", transformValue);
      } else {
        group.removeAttribute("transform");
      }

      if (color) {
        group.setAttribute("data-kugutu-part-color", partId);
      }
    }

    let colorChanged = false;
    if (color) {
      runtimeColors.set(partId, color);
      colorChanged = true;
    } else if (runtimeColors.delete(partId)) {
      colorChanged = true;
    }

    if (colorChanged) {
      rebuildRuntimeStyle();
    }
  }

  function applyPartAppearance(partSlot: PartSlotKey): void {
    const selection = partSelections[partSlot];
    if (!selection) {
      return;
    }

    const item = partCatalog[selection.partId];
    if (!item) {
      return;
    }

    const transform = resolvePartTransform(item.defaults, selection.transform);
    // Color matches compile-time semantics: only an explicit selection color
    // tints the part (catalog defaults position/scale the part but never recolor
    // its artwork), so swapping a part keeps its native colors.
    const color = selection.transform?.color;

    // Anchor parts (file fragments mounted at slot anchors) have no `nodes`:
    // their transform/color target the injected variant groups directly.
    if (!item.nodes) {
      applyAnchorPartAppearance(partSlot, selection.partId, transform, color);
      return;
    }

    let colorChanged = false;

    for (const [slotKeyValue, nodeId] of Object.entries(item.nodes)) {
      if (!nodeId) {
        continue;
      }

      const wrapper = ensurePartWrapper(nodeId, partSlot);
      if (!wrapper) {
        continue;
      }

      const transformValue = composePartNodeTransform(slotKeyValue as SlotKey, transform);
      if (transformValue) {
        wrapper.setAttribute("transform", transformValue);
      } else {
        wrapper.removeAttribute("transform");
      }

      if (color) {
        wrapper.setAttribute("data-kugutu-part-color", nodeId);
        runtimeColors.set(nodeId, color);
        colorChanged = true;
      } else if (runtimeColors.delete(nodeId)) {
        colorChanged = true;
      }
    }

    if (colorChanged) {
      rebuildRuntimeStyle();
    }
  }

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

  function scaleX(slotKey: SlotKey, scale: number): void {
    const transform = ensureTransform(slotKey);
    transform.scaleX *= scale;
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

  function visemeTarget(id: string): { open: number; width: number } {
    const pose = bundle.visemes?.[id] ?? bundle.visemes?.["sil"];
    return { open: pose?.open ?? 0, width: pose?.width ?? 1 };
  }

  function activeCue(speaking: SpeakingState, elapsedMs: number): ResolvedCue | undefined {
    let current: ResolvedCue | undefined;
    for (const cue of speaking.cues) {
      if (elapsedMs >= cue.startMs && elapsedMs < cue.endMs) {
        current = cue;
      }
    }
    return current;
  }

  function applySpeaking(deltaMs: number): void {
    const speaking = state.speaking;
    if (!speaking) {
      return;
    }

    speaking.elapsedMs += deltaMs;
    let elapsed = speaking.elapsedMs;
    const total = speaking.endMs + speaking.tailMs;
    if (speaking.loop && total > 0 && elapsed >= total) {
      speaking.elapsedMs = elapsed % total;
      elapsed = speaking.elapsedMs;
    }

    let target = { open: 0, width: 1 };
    if (elapsed < speaking.endMs) {
      const cue = activeCue(speaking, elapsed);
      if (cue) {
        target = visemeTarget(cue.viseme);
      }
    }

    const behavior = findBehavior(bundle, "mouth-open");
    const maxOpen = getBehaviorParam(behavior, "maxOpen", 0.9);
    const smoothing = clamp(getBehaviorParam(behavior, "smoothing", 0.2), 0, 1);
    const tau = 20 + smoothing * 160;
    const alpha = deltaMs <= 0 ? 0 : 1 - Math.exp(-deltaMs / tau);

    speaking.open += (target.open - speaking.open) * alpha;
    speaking.width += (target.width - speaking.width) * alpha;
    const open = clamp(speaking.open, 0, 1);

    if (nodes.has("mouth")) {
      scaleY("mouth", 1 + open * maxOpen);
      scaleX("mouth", speaking.width);
    }
    if (nodes.has("jaw")) {
      scaleY("jaw", 1 + open * maxOpen);
    }

    if (!speaking.loop && elapsed >= total) {
      state.speaking = null;
      state.mouthOpen = 0;
    }
  }

  function applyExpression(): void {
    const intensity = clamp(state.emotion.intensity, 0, 1);
    if (intensity <= 0) {
      return;
    }

    const expression = bundle.expressions?.find(
      (item) => item.id === state.emotion.name
    );
    if (!expression) {
      return;
    }

    for (const pose of expression.poses) {
      if (!nodes.has(pose.slot)) {
        continue;
      }

      const tx = (pose.translateX ?? 0) * intensity;
      const ty = (pose.translateY ?? 0) * intensity;
      if (tx !== 0 || ty !== 0) {
        translate(pose.slot, tx, ty);
      }
      if (pose.rotate) {
        rotate(pose.slot, pose.rotate * intensity);
      }
      if (pose.scaleX) {
        scaleX(pose.slot, 1 + pose.scaleX * intensity);
      }
      if (pose.scaleY) {
        scaleY(pose.slot, 1 + pose.scaleY * intensity);
      }
    }
  }

  function applyGesture(deltaMs: number): void {
    const active = state.gesture;
    if (!active) {
      return;
    }

    const gesture = bundle.gestures?.find((item) => item.id === active.id);
    if (!gesture) {
      state.gesture = null;
      return;
    }

    active.elapsedMs += deltaMs;

    let progress = gesture.durationMs > 0 ? active.elapsedMs / gesture.durationMs : 1;
    let finished = false;
    if (progress >= 1) {
      if (gesture.loop) {
        progress -= Math.floor(progress);
      } else {
        progress = 1;
        finished = true;
      }
    }

    for (const track of gesture.tracks) {
      if (!nodes.has(track.slot)) {
        continue;
      }

      const offsets = sampleGestureTrack(track.keyframes, progress);
      if (offsets.translateX !== 0 || offsets.translateY !== 0) {
        translate(track.slot, offsets.translateX, offsets.translateY);
      }
      if (offsets.rotate) {
        rotate(track.slot, offsets.rotate);
      }
      if (offsets.scaleX) {
        scaleX(track.slot, 1 + offsets.scaleX);
      }
      if (offsets.scaleY) {
        scaleY(track.slot, 1 + offsets.scaleY);
      }
    }

    if (finished) {
      state.gesture = null;
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
    if (state.speaking) {
      applySpeaking(deltaMs);
    } else {
      applyMouthOpen();
    }
    applyExpression();
    applyGesture(deltaMs);
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
    playGesture(id: string): void {
      const gesture = bundle.gestures?.find((item) => item.id === id);
      if (!gesture) {
        console.warn(`playGesture: no gesture "${id}" in bundle`);
        return;
      }
      state.gesture = { id, elapsedMs: 0 };
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
    speak(cues: VisemeCue[], options: SpeakOptions = {}): void {
      if (!Array.isArray(cues) || cues.length === 0) {
        this.stopSpeaking();
        return;
      }

      const sorted = [...cues].sort((a, b) => a.startMs - b.startMs);
      const defaultHoldMs = 90;
      const resolved: ResolvedCue[] = sorted.map((cue, index) => {
        const nextStart = sorted[index + 1]?.startMs;
        const fallbackEnd = nextStart ?? cue.startMs + defaultHoldMs;
        return {
          viseme: cue.viseme,
          startMs: cue.startMs,
          endMs: Math.max(cue.startMs, cue.endMs ?? fallbackEnd),
        };
      });
      const endMs = resolved.reduce((max, cue) => Math.max(max, cue.endMs), 0);

      state.speaking = {
        cues: resolved,
        endMs,
        tailMs: 120,
        elapsedMs: 0,
        loop: options.loop ?? false,
        open: state.mouthOpen,
        width: 1,
      };
      step(0);
    },
    stopSpeaking(): void {
      state.speaking = null;
      state.mouthOpen = 0;
      step(0);
    },
    setPart(partSlot: PartSlotKey, partId: string): void {
      const item = partCatalog[partId];
      if (!item || item.slot !== partSlot) {
        console.warn(`setPart: "${partId}" is not a ${partSlot} part`);
        return;
      }

      if (!applyVariantVisibility(partSlot, partId)) {
        console.warn(
          `setPart: no variant group for "${partId}" found in the SVG (was it compiled into the asset?)`
        );
        return;
      }

      const previous = partSelections[partSlot];
      partSelections[partSlot] = previous?.transform
        ? { partId, transform: previous.transform }
        : { partId };
      applyPartAppearance(partSlot);
    },
    setVariant(partSlot: PartSlotKey, partId: string): void {
      this.setPart(partSlot, partId);
    },
    tunePart(partSlot: PartSlotKey, transform: PartTransform): void {
      const selection = partSelections[partSlot];
      if (!selection) {
        console.warn(`tunePart: no part selected for ${partSlot}`);
        return;
      }

      selection.transform = { ...(selection.transform ?? {}), ...transform };
      applyPartAppearance(partSlot);
    },
    getPart(partSlot: PartSlotKey): string | undefined {
      return partSelections[partSlot]?.partId;
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

export function createCharacterPlayerFromPack(
  pack: CharPack,
  container: HTMLElement,
  options: { autoStart?: boolean } = {}
): CharacterPlayer {
  const svgAsset =
    pack.assets.find((asset) => asset.id === "primary-svg" && asset.type === "svg") ??
    pack.assets.find((asset) => asset.type === "svg");
  if (!svgAsset) {
    throw new Error("CharPack does not contain an SVG asset.");
  }

  container.innerHTML = svgAsset.content;
  const svgRoot = container.querySelector<SVGSVGElement>("svg");
  if (!svgRoot) {
    throw new Error("SVG root not found in CharPack asset.");
  }

  const player = createCharacterPlayer(pack.bundle, svgRoot);
  if (options.autoStart ?? true) {
    player.start();
  }

  return player;
}

export interface LoadOptions {
  autoStart?: boolean;
}

async function fetchPack(url: string): Promise<CharPack> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Kugutu.load: failed to fetch ${url}: ${response.status}`);
  }

  return response.json() as Promise<CharPack>;
}

/**
 * One-line actor loader: fetches a `.charpack` (or accepts a CharPack object),
 * mounts it into the target element, starts it, and returns the player.
 *
 * ```ts
 * const actor = await Kugutu.load("/mascot.charpack", "#stage");
 * actor.setEmotion("happy", 0.8);
 * actor.setPart("hair.front", "hair-front-bob-01");
 * ```
 */
export async function load(
  source: string | CharPack,
  target: HTMLElement | string,
  options: LoadOptions = {}
): Promise<CharacterPlayer> {
  const container =
    typeof target === "string"
      ? document.querySelector<HTMLElement>(target)
      : target;
  if (!container) {
    throw new Error(`Kugutu.load: target not found: ${String(target)}`);
  }

  const pack = typeof source === "string" ? await fetchPack(source) : source;
  return createCharacterPlayerFromPack(pack, container, options);
}

export const Kugutu = { load };
