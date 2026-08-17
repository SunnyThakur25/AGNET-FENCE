export type DataClassification = "public" | "internal" | "pii" | "phi" | "payment" | "secret";

export type DataGuardResult = {
  classification: DataClassification;
  occurrences: number;
  redactedValue: unknown;
  detectors: string[];
};

const classificationRank: Record<DataClassification, number> = {
  public: 0,
  internal: 1,
  pii: 2,
  phi: 3,
  payment: 4,
  secret: 5,
};

/**
 * Chooses the most restrictive sensitivity found across declared, inbound, and
 * outbound action context. This is used before policy evaluation so redaction
 * cannot turn a sensitive outbound request into an allow decision.
 */
export function strongestDataClassification(...classifications: DataClassification[]) {
  return classifications.reduce((strongest, candidate) => classificationRank[candidate] > classificationRank[strongest] ? candidate : strongest, "public" as DataClassification);
}

const patterns: Array<{ classification: DataClassification; detector: string; expression: RegExp; replacement: string }> = [
  { classification: "secret", detector: "api-key", expression: /\b(?:sk|pk|api)[-_][A-Za-z0-9_-]{16,}\b/g, replacement: "[REDACTED_SECRET]" },
  { classification: "secret", detector: "bearer-token", expression: /\bBearer\s+[A-Za-z0-9._-]{16,}\b/gi, replacement: "Bearer [REDACTED_TOKEN]" },
  { classification: "payment", detector: "payment-card", expression: /\b(?:\d[ -]*?){13,19}\b/g, replacement: "[REDACTED_PAYMENT_DATA]" },
  { classification: "pii", detector: "email", expression: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: "[REDACTED_EMAIL]" },
  { classification: "pii", detector: "national-id", expression: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "[REDACTED_PII]" },
  { classification: "phi", detector: "clinical-identifier", expression: /\b(?:MRN|patient[-_ ]?id|diagnosis)\s*[:=]\s*[A-Za-z0-9-]{4,}\b/gi, replacement: "[REDACTED_PHI]" },
];

const secretBearingKey = /(?:api[_-]?key|authorization|bearer|client[_-]?secret|credential|password|private[_-]?key|secret|session|token)/i;

function mergeResults(results: DataGuardResult[], redactedValue: unknown): DataGuardResult {
  const classification = strongestDataClassification(...results.map(result => result.classification));
  return { classification, occurrences: results.reduce((total, result) => total + result.occurrences, 0), detectors: Array.from(new Set(results.flatMap(result => result.detectors))), redactedValue };
}

function guardString(input: string): DataGuardResult {
  let redacted = input;
  let classification: DataClassification = "internal";
  let occurrences = 0;
  const detectors = new Set<string>();

  for (const pattern of patterns) {
    const matches = redacted.match(pattern.expression);
    if (!matches?.length) continue;
    occurrences += matches.length;
    detectors.add(pattern.detector);
    if (classificationRank[pattern.classification] > classificationRank[classification]) {
      classification = pattern.classification;
    }
    redacted = redacted.replace(pattern.expression, pattern.replacement);
  }

  return { classification, occurrences, redactedValue: redacted, detectors: Array.from(detectors) };
}

export function inspectAndRedact(value: unknown): DataGuardResult {
  return inspectStructuredValue(value, new WeakSet<object>());
}

function inspectStructuredValue(value: unknown, seen: WeakSet<object>): DataGuardResult {
  if (typeof value === "string") return guardString(value);
  if (value === null || value === undefined || typeof value !== "object") return guardString(String(value ?? ""));
  if (seen.has(value)) return { classification: "internal", occurrences: 1, redactedValue: "[REDACTED_CIRCULAR_VALUE]", detectors: ["circular-structure"] };
  seen.add(value);
  if (Array.isArray(value)) {
    const children = value.map(item => inspectStructuredValue(item, seen));
    return mergeResults(children, children.map(child => child.redactedValue));
  }
  const output: Record<string, unknown> = {};
  const results: DataGuardResult[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (secretBearingKey.test(key)) {
      const result: DataGuardResult = { classification: "secret", occurrences: 1, redactedValue: "[REDACTED_SECRET]", detectors: ["sensitive-field-name"] };
      output[key] = result.redactedValue;
      results.push(result);
    } else {
      const result = inspectStructuredValue(child, seen);
      output[key] = result.redactedValue;
      results.push(result);
    }
  }
  return mergeResults(results, output);
}

/**
 * Control-plane hook for agent middleware. Apply this to model outputs and
 * outbound destination payloads before any external handoff.
 */
export function inspectOutboundAndRedact(value: unknown) {
  return inspectAndRedact(value);
}
