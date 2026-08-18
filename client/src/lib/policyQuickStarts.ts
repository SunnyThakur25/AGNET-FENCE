export type PolicyDraft = {
  name: string;
  effect: "allow" | "deny" | "require_approval";
  agentId: string;
  toolPattern: string;
  actionPattern: string;
  dataSensitivity: "any" | "public" | "internal" | "pii" | "phi" | "payment" | "secret";
  destinationPattern: string;
  priority: string;
  description: string;
};

export const EMPTY_POLICY_DRAFT: PolicyDraft = {
  name: "",
  effect: "allow",
  agentId: "",
  toolPattern: "",
  actionPattern: "",
  dataSensitivity: "any",
  destinationPattern: "",
  priority: "100",
  description: "",
};

export const POLICY_QUICK_STARTS = {
  blank: { label: "Start from scratch", description: "Begin with an empty, editable policy form.", draft: EMPTY_POLICY_DRAFT },
  scoped_allow: { label: "Narrow allow — internal read", description: "A least-privilege starting point for an internal read action.", draft: { ...EMPTY_POLICY_DRAFT, name: "Allow internal customer lookup", toolPattern: "crm", actionPattern: "customer.read", dataSensitivity: "internal", destinationPattern: "crm.company.internal", description: "Allow a scoped read action only to the approved internal CRM destination." } },
  approval_required: { label: "Require approval — high impact", description: "A human-review starting point for a consequential operation.", draft: { ...EMPTY_POLICY_DRAFT, name: "Require approval for refund", effect: "require_approval" as const, toolPattern: "payments", actionPattern: "issue_refund", dataSensitivity: "payment" as const, destinationPattern: "payments.company.internal", priority: "200", description: "Require a human approval before a payment refund is delivered." } },
  deny_export: { label: "Deny — customer data export", description: "A restrictive starting point for blocking a high-risk export action.", draft: { ...EMPTY_POLICY_DRAFT, name: "Deny customer export", effect: "deny" as const, toolPattern: "crm", actionPattern: "customer.export", dataSensitivity: "pii" as const, destinationPattern: "*", priority: "900", description: "Block customer-data export actions; narrow or extend this intentionally for the tenant." } },
} as const;

export type PolicyQuickStartId = keyof typeof POLICY_QUICK_STARTS;

export function policyDraftForQuickStart(id: PolicyQuickStartId): PolicyDraft {
  return { ...POLICY_QUICK_STARTS[id].draft };
}
