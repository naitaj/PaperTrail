/**
 * Abstention Gate Thresholds (TRD §7.4).
 * Calibrated strictly on the development split (data/eval/questions.dev.jsonl).
 */

export interface GateThresholdConfig {
  bm25: Record<string, number>;
  embedding: Record<string, number>;
}

export const GATE_THRESHOLDS: GateThresholdConfig = {
  bm25: {
    ck640: 11.0,
    ck256: 11.0,
  },
  embedding: {
    ck640: 0.35,
    ck256: 0.35,
  },
};

