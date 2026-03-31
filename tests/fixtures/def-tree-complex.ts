export function entry() {
  const raw = loadConfig();
  const parsed = parseConfig(raw);
  const normalized = normalizeConfig(parsed);
  const score = computeScore(normalized, 2);
  const result = finalizeResult(score);
  audit(result);
  audit(result);
  return result;
}

export function loadConfig() {
  return readEnv();
}

export function readEnv() {
  return sanitizeEnv("APP_MODE");
}

export function sanitizeEnv(key: string) {
  return key.trim().toLowerCase();
}

export function parseConfig(raw: string) {
  if (!raw) {
    return defaultConfig();
  }
  return expandConfig(raw);
}

export function defaultConfig() {
  return "default";
}

export function expandConfig(raw: string) {
  return raw + ":" + raw;
}

export function normalizeConfig(cfg: string) {
  const compact = shrinkConfig(cfg);
  return compact;
}

export function shrinkConfig(cfg: string) {
  return cfg.replace("::", ":");
}

export function computeScore(cfg: string, weight: number) {
  const base = evaluate(cfg);
  const weighted = applyWeight(base, weight);
  return combineScores(base, weighted);
}

export function evaluate(cfg: string) {
  const a = metricA(cfg);
  const b = metricB(cfg);
  return add(a, b);
}

export function metricA(cfg: string) {
  return lengthOf(cfg);
}

export function metricB(cfg: string) {
  return lengthOf(cfg);
}

export function lengthOf(cfg: string) {
  return cfg.length;
}

export function applyWeight(value: number, weight: number) {
  return multiply(value, weight);
}

export function multiply(a: number, b: number) {
  return a * b;
}

export function combineScores(a: number, b: number) {
  return add(a, b);
}

export function add(a: number, b: number) {
  return a + b;
}

export function finalizeResult(value: number) {
  return formatResult(value);
}

export function formatResult(value: number) {
  return "score:" + value;
}

export function audit(result: string) {
  return logResult(result);
}

export function logResult(result: string) {
  return result;
}
