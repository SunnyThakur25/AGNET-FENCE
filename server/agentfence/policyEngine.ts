export type PolicyEffect = "allow" | "deny" | "require_approval";

export type ParameterConstraint = {
  field: string;
  operator: "equals" | "exists" | "gt" | "includes";
  value?: string | number | boolean;
};

export type PolicyCandidate = {
  id: number;
  name: string;
  effect: PolicyEffect;
  toolPattern: string;
  actionPattern: string;
  parameterConstraints: unknown;
  dataSensitivity: string;
  destinationPattern: string;
  priority: number;
};

export type PolicyRequest = {
  toolName: string;
  action: string;
  parameters: Record<string, unknown>;
  dataSensitivity: string;
  destination: string;
};

export type PolicyDecision = {
  decision: "allowed" | "blocked" | "approval_required";
  matchedPolicy: PolicyCandidate | null;
  reason: string;
};

/**
 * Linear-time glob matcher. It intentionally supports only `*` and `?` so
 * policies cannot inject arbitrary regular expressions or trigger regex backtracking.
 */
export function globMatch(pattern: string, value: string) {
  const source = pattern.trim().toLowerCase();
  const candidate = value.trim().toLowerCase();
  let patternIndex = 0;
  let valueIndex = 0;
  let starIndex = -1;
  let retryValueIndex = 0;
  while (valueIndex < candidate.length) {
    if (patternIndex < source.length && (source[patternIndex] === "?" || source[patternIndex] === candidate[valueIndex])) {
      patternIndex += 1;
      valueIndex += 1;
    } else if (patternIndex < source.length && source[patternIndex] === "*") {
      starIndex = patternIndex;
      patternIndex += 1;
      retryValueIndex = valueIndex;
    } else if (starIndex >= 0) {
      patternIndex = starIndex + 1;
      retryValueIndex += 1;
      valueIndex = retryValueIndex;
    } else return false;
  }
  while (patternIndex < source.length && source[patternIndex] === "*") patternIndex += 1;
  return patternIndex === source.length;
}

function policySpecificity(policy: PolicyCandidate) {
  const literals = [policy.toolPattern, policy.actionPattern, policy.destinationPattern].reduce((total, pattern) => total + pattern.replace(/[?*]/g, "").length, 0);
  const constraints = Array.isArray(policy.parameterConstraints) ? policy.parameterConstraints.length * 10 : 0;
  const sensitivity = policy.dataSensitivity === "any" ? 0 : 5;
  return literals + constraints + sensitivity;
}

function policyOrder(a: PolicyCandidate, b: PolicyCandidate) {
  if (a.priority !== b.priority) return b.priority - a.priority;
  const effectRank: Record<PolicyEffect, number> = { deny: 3, require_approval: 2, allow: 1 };
  if (effectRank[a.effect] !== effectRank[b.effect]) return effectRank[b.effect] - effectRank[a.effect];
  const specificity = policySpecificity(b) - policySpecificity(a);
  if (specificity !== 0) return specificity;
  return a.id - b.id;
}

function constraintsMatch(rawConstraints: unknown, parameters: Record<string, unknown>) {
  if (!Array.isArray(rawConstraints) || rawConstraints.length === 0) return true;

  return rawConstraints.every(rawConstraint => {
    const constraint = rawConstraint as ParameterConstraint;
    const actual = parameters[constraint.field];

    if (constraint.operator === "exists") return actual !== undefined && actual !== null && actual !== "";
    if (constraint.operator === "equals") return actual === constraint.value;
    if (constraint.operator === "gt") return typeof actual === "number" && typeof constraint.value === "number" && actual > constraint.value;
    if (constraint.operator === "includes") return Array.isArray(actual) && actual.includes(constraint.value);
    return false;
  });
}

export function evaluatePolicies(candidates: PolicyCandidate[], request: PolicyRequest): PolicyDecision {
  const orderedCandidates = [...candidates].sort(policyOrder);
  const matchedPolicy = orderedCandidates.find(policy => {
    const sensitivityMatches = policy.dataSensitivity === "any" || policy.dataSensitivity === request.dataSensitivity;
    return (
      globMatch(policy.toolPattern, request.toolName) &&
      globMatch(policy.actionPattern, request.action) &&
      globMatch(policy.destinationPattern, request.destination) &&
      sensitivityMatches &&
      constraintsMatch(policy.parameterConstraints, request.parameters)
    );
  });

  if (!matchedPolicy) {
    return { decision: "blocked", matchedPolicy: null, reason: "No active policy grants this agent permission for the requested tool action." };
  }

  const decision = matchedPolicy.effect === "allow" ? "allowed" : matchedPolicy.effect === "deny" ? "blocked" : "approval_required";
  return {
    decision,
    matchedPolicy,
    reason: `Matched policy “${matchedPolicy.name}” with ${matchedPolicy.effect.replace("_", " ")} effect.`,
  };
}
