/**
 * A mouth shape for a single viseme. `open` is the mouth-open amount in [0, 1]
 * (driven through the same channel as `setMouthOpen`); `width` is a
 * multiplicative horizontal factor (1 = neutral, <1 = rounded like "O"/"U",
 * >1 = wide like "E"/"I").
 */
export interface VisemePose {
  open: number;
  width?: number;
}

/** Map of viseme id (e.g. "aa", "O", "PP", "sil") to its mouth pose. */
export type VisemeMap = Record<string, VisemePose>;

/**
 * Built-in viseme library, compiled into every bundle. Ids follow the common
 * Oculus/JALI-style set, reduced to the open/width parameters a 2D mouth can
 * express. Authors override or extend entries by id via `visemes` in the source.
 * `sil` is the rest/closed shape used between cues.
 */
export const DEFAULT_VISEMES: VisemeMap = {
  sil: { open: 0, width: 1 },
  PP: { open: 0, width: 0.95 },
  FF: { open: 0.15, width: 1 },
  TH: { open: 0.25, width: 1 },
  DD: { open: 0.3, width: 1 },
  kk: { open: 0.3, width: 1 },
  CH: { open: 0.25, width: 0.9 },
  SS: { open: 0.15, width: 1.05 },
  nn: { open: 0.2, width: 1 },
  RR: { open: 0.3, width: 0.9 },
  aa: { open: 0.9, width: 1.1 },
  E: { open: 0.5, width: 1.15 },
  I: { open: 0.35, width: 1.1 },
  O: { open: 0.6, width: 0.8 },
  U: { open: 0.4, width: 0.7 },
};

export const VISEME_REST_ID = "sil";
