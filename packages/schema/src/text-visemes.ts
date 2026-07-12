/**
 * Synthetic viseme-cue generation from script text, for TTS engines that do
 * not report phoneme/word timestamps (e.g. Gemini TTS). Given the text that
 * was spoken and the measured audio duration, this produces a plausible timed
 * viseme track for `speak()` — not phonetically exact, but visually convincing
 * lip motion that starts and ends with the audio.
 */

/**
 * A single timed lip-sync cue. `startMs`/`endMs` are relative to the start of
 * the utterance (matching how TTS engines emit viseme events by audio offset).
 * When `endMs` is omitted the cue runs until the next cue starts.
 */
export interface VisemeCue {
  viseme: string;
  startMs: number;
  endMs?: number;
}

export interface VisemesFromTextOptions {
  /** Total duration of the spoken audio in milliseconds. */
  durationMs: number;
  /**
   * Text language. Only `"ja"` (the default) has a real mora model today;
   * other scripts still degrade gracefully (see below), so passing mixed
   * Japanese/Latin text is fine.
   */
  lang?: "ja";
}

type Vowel = "a" | "i" | "u" | "e" | "o";

interface KanaMora {
  kind: "kana";
  vowel: Vowel;
  /** Brief lip-closure (PP) or lip-friction (FF) onset before the vowel. */
  onset: "PP" | "FF" | null;
}

type Mora =
  | KanaMora
  | { kind: "closure" } // っ — geminate stop, mouth briefly shuts
  | { kind: "nasal" } // ん — moraic nasal
  | { kind: "pause"; weight: number } // punctuation / whitespace
  | { kind: "generic"; count: number }; // no reading available (kanji, latin)

const KANA_VOWEL_ROWS: Record<Vowel, string> = {
  a: "あかがさざただなはばぱまやらわ",
  i: "いきぎしじちぢにひびぴみり",
  u: "うくぐすずつづぬふぶぷむゆるゔ",
  e: "えけげせぜてでねへべぺめれ",
  o: "おこごそぞとどのほぼぽもよろを",
};

const KANA_TO_VOWEL = new Map<string, Vowel>();
for (const [vowel, row] of Object.entries(KANA_VOWEL_ROWS) as [Vowel, string][]) {
  for (const kana of row) {
    KANA_TO_VOWEL.set(kana, vowel);
  }
}

/** Consonants articulated with closed lips — worth a visible PP onset. */
const BILABIAL_KANA = new Set("まみむめもばびぶべぼぱぴぷぺぽ");

/** Small kana that replace the vowel of the preceding mora (きゃ → "kya"). */
const SMALL_KANA_VOWELS: Record<string, Vowel> = {
  ゃ: "a",
  ゅ: "u",
  ょ: "o",
  ぁ: "a",
  ぃ: "i",
  ぅ: "u",
  ぇ: "e",
  ぉ: "o",
  ゎ: "a",
};

const SENTENCE_PAUSE = new Set("。．.!?！？…‥");
const COMMA_PAUSE = new Set("、，,・：:；;");

const VOWEL_VISEME: Record<Vowel, string> = {
  a: "aa",
  i: "I",
  u: "U",
  e: "E",
  o: "O",
};

/**
 * Deterministic vowel cycle used for characters whose reading is unknown
 * (kanji without furigana, Latin letters, digits): the mouth keeps moving
 * through varied plausible shapes instead of freezing or guessing readings.
 */
const GENERIC_VISEME_CYCLE = ["aa", "I", "E", "O", "U"];

/** Katakana (including ヴ) → hiragana so one lookup table covers both. */
function normalizeToHiragana(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0)!;
    out +=
      code >= 0x30a1 && code <= 0x30f6
        ? String.fromCodePoint(code - 0x60)
        : char;
  }
  return out;
}

function isCjkIdeograph(char: string): boolean {
  const code = char.codePointAt(0)!;
  return (
    (code >= 0x3400 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    char === "々"
  );
}

function isAlphanumeric(char: string): boolean {
  return /[0-9A-Za-z０-９Ａ-Ｚａ-ｚ]/.test(char);
}

function parseMorae(text: string): Mora[] {
  const morae: Mora[] = [];

  const pushPause = (weight: number): void => {
    const last = morae[morae.length - 1];
    if (last?.kind === "pause") {
      last.weight = Math.max(last.weight, weight);
      return;
    }
    morae.push({ kind: "pause", weight });
  };

  for (const char of normalizeToHiragana(text)) {
    const smallVowel = SMALL_KANA_VOWELS[char];
    if (smallVowel) {
      const last = morae[morae.length - 1];
      if (last?.kind === "kana") {
        last.vowel = smallVowel;
      } else {
        morae.push({ kind: "kana", vowel: smallVowel, onset: null });
      }
      continue;
    }

    if (char === "っ") {
      morae.push({ kind: "closure" });
      continue;
    }
    if (char === "ん") {
      morae.push({ kind: "nasal" });
      continue;
    }
    if (char === "ー" || char === "〜" || char === "ｰ") {
      const last = morae[morae.length - 1];
      if (last?.kind === "kana") {
        // Long vowel: hold the mouth shape for another mora (no re-onset).
        morae.push({ kind: "kana", vowel: last.vowel, onset: null });
      }
      continue;
    }

    const vowel = KANA_TO_VOWEL.get(char);
    if (vowel) {
      morae.push({
        kind: "kana",
        vowel,
        onset: BILABIAL_KANA.has(char) ? "PP" : char === "ふ" ? "FF" : null,
      });
      continue;
    }

    if (SENTENCE_PAUSE.has(char)) {
      pushPause(2);
      continue;
    }
    if (COMMA_PAUSE.has(char) || /\s/.test(char)) {
      pushPause(1);
      continue;
    }
    if (isCjkIdeograph(char)) {
      // A kanji is roughly two morae of speech on average.
      morae.push({ kind: "generic", count: 2 });
      continue;
    }
    if (isAlphanumeric(char)) {
      morae.push({ kind: "generic", count: 1 });
      continue;
    }
    // Unpronounced symbols (quotes, brackets, emoji, …) are skipped.
  }

  return morae;
}

/**
 * Generates a synthetic viseme cue track from script text, spreading the
 * morae of `text` uniformly across `durationMs`. Designed for the common TTS
 * case where the engine returns audio but no phoneme timestamps: pass the
 * spoken text plus the decoded audio duration and feed the result straight to
 * `CharacterPlayer.speak()`.
 *
 * Japanese kana get a real mora model (vowel shapes, ん→`nn`, っ→closure,
 * ー extends the vowel, bilabials get a brief `PP` lip-close). Characters
 * without a known reading (kanji, Latin, digits) degrade to a deterministic
 * cycle of vowel shapes so the mouth keeps moving plausibly; punctuation
 * becomes a rest (`sil`). The output is deterministic for the same input.
 *
 * ```ts
 * const cues = visemesFromText("こんにちは、世界！", { durationMs: 1400 });
 * player.speak(cues);
 * audio.play();
 * ```
 */
export function visemesFromText(
  text: string,
  options: VisemesFromTextOptions
): VisemeCue[] {
  const durationMs = options.durationMs;
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return [];
  }

  const segments: { viseme: string; weight: number }[] = [];
  let genericIndex = 0;

  for (const mora of parseMorae(text)) {
    switch (mora.kind) {
      case "kana":
        if (mora.onset) {
          segments.push({ viseme: mora.onset, weight: 0.35 });
          segments.push({ viseme: VOWEL_VISEME[mora.vowel], weight: 0.65 });
        } else {
          segments.push({ viseme: VOWEL_VISEME[mora.vowel], weight: 1 });
        }
        break;
      case "closure":
        segments.push({ viseme: "sil", weight: 0.6 });
        break;
      case "nasal":
        segments.push({ viseme: "nn", weight: 1 });
        break;
      case "pause":
        segments.push({ viseme: "sil", weight: mora.weight });
        break;
      case "generic":
        for (let index = 0; index < mora.count; index += 1) {
          segments.push({
            viseme:
              GENERIC_VISEME_CYCLE[genericIndex % GENERIC_VISEME_CYCLE.length]!,
            weight: 1,
          });
          genericIndex += 1;
        }
        break;
    }
  }

  const totalWeight = segments.reduce((sum, segment) => sum + segment.weight, 0);
  if (totalWeight <= 0) {
    return [];
  }

  const cues: VisemeCue[] = [];
  let accumulated = 0;
  let previousEndMs = 0;
  for (const segment of segments) {
    accumulated += segment.weight;
    const endMs = Math.round((accumulated / totalWeight) * durationMs);
    if (endMs > previousEndMs) {
      cues.push({ viseme: segment.viseme, startMs: previousEndMs, endMs });
      previousEndMs = endMs;
    }
    // Segments rounded to zero length fold into the next cue.
  }

  return cues;
}
