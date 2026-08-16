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

function wildcardMatch(pattern: string, value: string) {
  if (pattern === "*") return true;
  return pattern.toLowerCase() === value.toLowerCase();
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
  const orderedCandidates = [...candidates].sort((a, b) => b.priority - a.priority);
  const matchedPolicy = orderedCandidates.find(policy => {
    const sensitivityMatches = policy.dataSensitivity === "any" || policy.dataSensitivity === request.dataSensitivity;
    return (
      wildcardMatch(policy.toolPattern, request.toolName) &&
      wildcardMatch(policy.actionPattern, request.action) &&
      wildcardMatch(policy.destinationPattern, request.destination) &&
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
