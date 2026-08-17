export type TraceStatus = "info" | "allowed" | "blocked" | "approval_required" | "approved" | "rejected";

type ActionCall = {
  id: number;
  toolName: string;
  action: string;
  destination: string;
  decision: string;
  dataSensitivity: string;
  redactedParameters: unknown;
  targetOutcome: "succeeded" | "failed" | null;
  targetStatusCode: number | null;
  targetReference: string | null;
  targetRecordedAt: Date | null;
  createdAt: Date;
};

type TraceAgent = { id: number; name: string; identity: string };
type TracePolicy = { id: number; name: string } | null;
type TraceFinding = { classification: string; actionTaken: string; occurrences: number; createdAt: Date };
type TraceApproval = { id: number; status: string; requestedBy: string; decidedAt: Date | null; createdAt: Date } | null;
type TraceAuditEvent = { id: number; eventType: string; outcome: string; createdAt: Date };

function toTraceStatus(value: string): TraceStatus {
  if (["allowed", "approved", "blocked", "approval_required", "rejected"].includes(value)) return value as TraceStatus;
  return "info";
}

export function buildActionTrace(input: {
  call: ActionCall;
  agent: TraceAgent;
  policy: TracePolicy;
  findings: TraceFinding[];
  approval: TraceApproval;
  auditEvents: TraceAuditEvent[];
}) {
  const gatewayEvent = input.auditEvents.find(event => event.eventType.includes("gateway"));
  const initialDecision = gatewayEvent?.outcome ?? input.call.decision;
  const dataGuardSummary = input.findings.length
    ? `${input.findings.length} finding${input.findings.length === 1 ? "" : "s"}; ${input.findings.reduce((total, finding) => total + finding.occurrences, 0)} value(s) ${input.findings.some(finding => finding.actionTaken === "blocked") ? "restricted" : "redacted"}.`
    : "Scanned with no stored sensitive-data findings.";

  const hops = [
    {
      id: "agent-intent",
      label: "Agent intent captured",
      status: "info" as TraceStatus,
      timestamp: input.call.createdAt,
      detail: `${input.agent.name} requested ${input.call.toolName}.${input.call.action} for ${input.call.destination}.`,
    },
    {
      id: "data-guard",
      label: "Data Guard boundary",
      status: input.findings.length ? "info" as TraceStatus : "allowed" as TraceStatus,
      timestamp: input.findings[0]?.createdAt ?? input.call.createdAt,
      detail: dataGuardSummary,
    },
    {
      id: "policy-engine",
      label: "Policy Engine decision",
      status: toTraceStatus(initialDecision),
      timestamp: gatewayEvent?.createdAt ?? input.call.createdAt,
      detail: input.policy ? `Matched policy: ${input.policy.name}. Initial decision: ${initialDecision.replace(/_/g, " ")}.` : `No matching policy metadata retained. Initial decision: ${initialDecision.replace(/_/g, " ")}.`,
    },
  ];

  if (input.approval) {
    hops.push({
      id: "human-approval",
      label: "Human approval workflow",
      status: toTraceStatus(input.approval.status),
      timestamp: input.approval.decidedAt ?? input.approval.createdAt,
      detail: `Approval #${input.approval.id} is ${input.approval.status.replace(/_/g, " ")}.`,
    });
  }

  const finalAllowed = ["allowed", "approved"].includes(input.call.decision);
  const targetReported = input.call.targetOutcome !== null;
  const targetStatus = input.call.targetOutcome === "failed" ? "blocked" as TraceStatus : toTraceStatus(input.call.decision);
  hops.push({
    id: "target-boundary",
    label: !finalAllowed ? "Target boundary contained" : targetReported ? "Target-system outcome recorded" : "Target boundary released",
    status: targetStatus,
    timestamp: input.call.targetRecordedAt ?? input.auditEvents.at(-1)?.createdAt ?? input.call.createdAt,
    detail: !finalAllowed
      ? `No request was released to ${input.call.destination}; the governed action stopped at AgentFence.`
      : input.call.targetOutcome === "succeeded"
        ? `The wrapped target integration reported success${input.call.targetStatusCode ? ` (status ${input.call.targetStatusCode})` : ""}${input.call.targetReference ? ` with reference ${input.call.targetReference}` : ""}.`
        : input.call.targetOutcome === "failed"
          ? `The wrapped target integration reported failure${input.call.targetStatusCode ? ` (status ${input.call.targetStatusCode})` : ""}. No raw response body was retained.`
          : `AgentFence released the governed request to ${input.call.destination}; the wrapper has not reported a target-system outcome yet.`,
  });

  return {
    action: {
      id: input.call.id,
      toolName: input.call.toolName,
      action: input.call.action,
      destination: input.call.destination,
      decision: input.call.decision,
      dataSensitivity: input.call.dataSensitivity,
      redactedParameters: input.call.redactedParameters,
      targetOutcome: input.call.targetOutcome,
      targetStatusCode: input.call.targetStatusCode,
      targetReference: input.call.targetReference,
      targetRecordedAt: input.call.targetRecordedAt,
      agent: input.agent,
    },
    policy: input.policy,
    dataGuardFindings: input.findings.map(finding => ({ classification: finding.classification, actionTaken: finding.actionTaken, occurrences: finding.occurrences })),
    hops,
    auditEvents: input.auditEvents,
  };
}
