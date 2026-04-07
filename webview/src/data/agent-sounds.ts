/**
 * Agent signature sounds — each chess piece has a unique audio identity.
 *
 * Defined as oscillator parameters so SoundSystem can synthesize them.
 * No audio files needed.
 */

export interface AgentChime {
  /** Sequence of frequencies (Hz) played as ascending/descending notes. */
  notes: number[];
  /** Oscillator type for the notes. */
  type: OscillatorType;
  /** Duration per note in seconds. */
  noteDuration: number;
  /** Delay between notes in seconds. */
  noteGap: number;
  /** Volume multiplier (0-1). */
  volume: number;
}

/**
 * Signature chimes for each Scacchiera agent.
 *
 * Design philosophy:
 * - White pieces: consonant, major intervals, authoritative
 * - Black pieces: dissonant, minor/chromatic, unsettling
 * - Neutral pieces: functional, clean tones
 */
export const AGENT_CHIMES: Record<string, AgentChime> = {
  // King — majestic low brass chord, C3-E3-G3.
  king: {
    notes: [131, 165, 196],
    type: "sawtooth",
    noteDuration: 0.18,
    noteGap: 0.1,
    volume: 0.25,
  },
  // Queen — elegant rising arpeggio, C5-E5-G5-C6.
  queen: {
    notes: [523, 659, 784, 1047],
    type: "sine",
    noteDuration: 0.1,
    noteGap: 0.06,
    volume: 0.2,
  },
  // White Rook — heavy power chord, low E2-B2.
  "white-rook": {
    notes: [82, 123],
    type: "square",
    noteDuration: 0.2,
    noteGap: 0.08,
    volume: 0.2,
  },
  // Bishop — contemplative two-note, A4-D5.
  bishop: {
    notes: [440, 587],
    type: "sine",
    noteDuration: 0.15,
    noteGap: 0.12,
    volume: 0.18,
  },
  // Knight — crisp staccato triple, G4-B4-D5.
  knight: {
    notes: [392, 494, 587],
    type: "triangle",
    noteDuration: 0.08,
    noteGap: 0.05,
    volume: 0.22,
  },
  // Pawn — quick high double tap, C6-E6.
  pawn: {
    notes: [1047, 1319],
    type: "sine",
    noteDuration: 0.05,
    noteGap: 0.04,
    volume: 0.15,
  },
  // Black Rook — ominous low slide, Eb2-Bb1.
  "black-rook": {
    notes: [78, 58],
    type: "sawtooth",
    noteDuration: 0.25,
    noteGap: 0.05,
    volume: 0.2,
  },
  // Black Bishop — dissonant minor second, B3-C4.
  "black-bishop": {
    notes: [247, 262],
    type: "square",
    noteDuration: 0.2,
    noteGap: 0.02,
    volume: 0.18,
  },
  // Black Knight — chaotic staccato, random-feeling but fixed: F#4-C5-Ab4.
  "black-knight": {
    notes: [370, 523, 415],
    type: "sawtooth",
    noteDuration: 0.06,
    noteGap: 0.03,
    volume: 0.2,
  },
  // Chancellor — clean mechanical beep, A4-A4 (double tap, same note).
  chancellor: {
    notes: [440, 440],
    type: "triangle",
    noteDuration: 0.08,
    noteGap: 0.1,
    volume: 0.15,
  },
  // Cardinal — lab-precise rising fifth, C5-G5.
  cardinal: {
    notes: [523, 784],
    type: "sine",
    noteDuration: 0.12,
    noteGap: 0.08,
    volume: 0.18,
  },
  // Scout — radar ping, high E6 single.
  scout: {
    notes: [1319],
    type: "sine",
    noteDuration: 0.15,
    noteGap: 0,
    volume: 0.15,
  },
  // Ship — foghorn, low C2 single sustained.
  ship: {
    notes: [65],
    type: "sawtooth",
    noteDuration: 0.35,
    noteGap: 0,
    volume: 0.2,
  },
};
