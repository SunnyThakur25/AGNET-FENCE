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

const patterns: Array<{ classification: DataClassification; detector: string; expression: RegExp; replacement: string }> = [
  { classification: "secret", detector: "api-key", expression: /\b(?:sk|pk|api)[-_][A-Za-z0-9_-]{16,}\b/g, replacement: "[REDACTED_SECRET]" },
  { classification: "secret", detector: "bearer-token", expression: /\bBearer\s+[A-Za-z0-9._-]{16,}\b/gi, replacement: "Bearer [REDACTED_TOKEN]" },
  { classification: "payment", detector: "payment-card", expression: /\b(?:\d[ -]*?){13,19}\b/g, replacement: "[REDACTED_PAYMENT_DATA]" },
  { classification: "pii", detector: "email", expression: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: "[REDACTED_EMAIL]" },
  { classification: "pii", detector: "national-id", expression: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "[REDACTED_PII]" },
  { classification: "phi", detector: "clinical-identifier", expression: /\b(?:MRN|patient[-_ ]?id|diagnosis)\s*[:=]\s*[A-Za-z0-9-]{4,}\b/gi, replacement: "[REDACTED_PHI]" },
];

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
  const rendered = typeof value === "string" ? value : JSON.stringify(value ?? {});
  const result = guardString(rendered);

  if (typeof value === "string") return result;

  try {
    return { ...result, redactedValue: JSON.parse(String(result.redactedValue)) };
  } catch {
    return result;
  }
}

/**
 * Control-plane hook for agent middleware. Apply this to model outputs and
 * outbound destination payloads before any external handoff.
 */
export function inspectOutboundAndRedact(value: unknown) {
  return inspectAndRedact(value);
}
