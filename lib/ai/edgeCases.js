/**
 * Heuristic detectors for edge cases that we want to handle deterministically
 * (i.e. without spending an LLM round-trip). The LLM still handles nuance, but
 * these give us fast, reliable behavior for clear-cut signals.
 */

const ANGRY_PATTERNS = [
  /\b(stupid|useless|terrible|worst|horrible|ridiculous|idiot|hate|angry|furious|frustrat\w*)\b/i,
  /\b(this is (a )?(joke|waste|nonsense))\b/i,
  /(damn|wtf|fed up)/i,
];

const GOODBYE_PATTERNS = [
  /\b(bye|goodbye|that'?s all|nothing else|thank you,? bye|hang up|no thanks?,? bye)\b/i,
];

const HUMAN_REQUEST_PATTERNS = [
  /\b(real person|human|agent|representative|speak to someone|talk to a person|front desk|receptionist)\b/i,
];

function isEmptyOrNoise(text) {
  if (!text) return true;
  const cleaned = text.replace(/[^a-z0-9]/gi, '').trim();
  return cleaned.length === 0;
}

function isLikelyUnclear(text) {
  if (!text) return true;
  const words = text.trim().split(/\s+/).filter(Boolean);
  // Very short, single-token utterances that aren't obviously meaningful.
  if (words.length === 0) return true;
  if (words.length === 1 && words[0].length <= 2) return true;
  return false;
}

function isAngry(text) {
  return ANGRY_PATTERNS.some((re) => re.test(text || ''));
}

function isGoodbye(text) {
  return GOODBYE_PATTERNS.some((re) => re.test(text || ''));
}

function wantsHuman(text) {
  return HUMAN_REQUEST_PATTERNS.some((re) => re.test(text || ''));
}

module.exports = {
  isEmptyOrNoise,
  isLikelyUnclear,
  isAngry,
  isGoodbye,
  wantsHuman,
};
