import { invokeLLM, listLLMModels } from "../_core/llm";

export const AI_ASSISTANT_PAGE_IDS = [
  "command_center",
  "agents",
  "policies",
  "policy_governance",
  "gateway",
  "mcp_gateway",
  "operations",
  "coverage",
  "integrations",
  "secure_connectors",
  "team",
  "billing",
  "action_capture",
  "action_trace",
  "approvals",
  "audit",
  "data_guard",
  "vault",
  "tests",
  "compliance",
  "settings",
  "account",
  "other",
] as const;

export type AiAssistantPageId = (typeof AI_ASSISTANT_PAGE_IDS)[number];

const pageLabels: Record<AiAssistantPageId, string> = {
  command_center: "Command center",
  agents: "Agent Registry",
  policies: "Policy Engine",
  policy_governance: "Policy Governance",
  gateway: "Tool Gateway",
  mcp_gateway: "Native MCP Gateway",
  operations: "Operations center",
  coverage: "Coverage posture",
  integrations: "Integrations",
  secure_connectors: "Secure connectors",
  team: "Team management",
  billing: "Billing & plans",
  action_capture: "Action Capture",
  action_trace: "Action Trace",
  approvals: "Approvals",
  audit: "Audit Ledger",
  data_guard: "Data Guard",
  vault: "Credential Vault",
  tests: "Attack Simulation",
  compliance: "Compliance Evidence",
  settings: "Settings",
  account: "Account & security",
  other: "another AgentFence screen",
};

const PRIVATE_KEY_BLOCK = /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g;
const NAMED_CREDENTIAL_VALUE = /\b(?:api[_ -]?key|authorization|bearer[_ -]?token|access[_ -]?token|refresh[_ -]?token|password|client[_ -]?secret|private[_ -]?key|vault[_ -]?secret[_ -]?id)\b\s*(?::|=|is)\s*(?:bearer\s+)?[^\s,;]+/gi;
const HIGH_ENTROPY_TOKEN = /\b(?:sk|rk|ghp|xoxb|AKIA|AIza)[A-Za-z0-9_\-]{16,}\b/g;

export function redactAssistantText(value: string) {
  let redactions = 0;
  const replace = (expression: RegExp, text: string) => text.replace(expression, () => {
    redactions += 1;
    return "[redacted credential material]";
  });
  let redacted = replace(PRIVATE_KEY_BLOCK, value);
  redacted = replace(NAMED_CREDENTIAL_VALUE, redacted);
  redacted = replace(HIGH_ENTROPY_TOKEN, redacted);
  return { text: redacted, redactions };
}

export function prepareAssistantQuestion(question: string) {
  const normalized = question.replace(/\u0000/g, "").trim();
  return redactAssistantText(normalized);
}

const ASSISTANT_WINDOW_MS = 60_000;
const ASSISTANT_REQUEST_LIMIT = 12;
const assistantRequestWindows = new Map<string, { startedAt: number; count: number }>();

export function consumeAssistantRequestQuota(key: string, now = Date.now()) {
  const current = assistantRequestWindows.get(key);
  const window = !current || now - current.startedAt >= ASSISTANT_WINDOW_MS
    ? { startedAt: now, count: 0 }
    : current;
  window.count += 1;
  assistantRequestWindows.set(key, window);
  for (const [candidate, candidateWindow] of Array.from(assistantRequestWindows.entries())) {
    if (now - candidateWindow.startedAt > ASSISTANT_WINDOW_MS * 2) assistantRequestWindows.delete(candidate);
  }
  return {
    allowed: window.count <= ASSISTANT_REQUEST_LIMIT,
    remaining: Math.max(0, ASSISTANT_REQUEST_LIMIT - window.count),
    retryAfterMs: Math.max(0, ASSISTANT_WINDOW_MS - (now - window.startedAt)),
  };
}

export function buildAssistantSystemPrompt(currentPage: AiAssistantPageId) {
  return `You are AgentFence Guide, an in-product assistant for authenticated security operators. Help users understand and safely operate AgentFence. The user is currently viewing: ${pageLabels[currentPage]}.

AgentFence governs consequential AI-agent actions that are integrated through its SDK, browser wrapper, or Native MCP Gateway. It verifies identity, evaluates tenant-scoped policies, applies Data Guard inspection/redaction, can require human approval, and records audit evidence. It does not claim to observe or stop agents that bypass those integrated paths.

Policies are authored from scratch by administrators: scope the target agent, tool pattern, action pattern, destination pattern, data sensitivity, effect, and priority. Quick starts only fill editable example values; they are not preconfigured or automatically enforced. New policy proposals remain subject to the product's review and promotion workflow.

You have no access to tenant records, live action details, credentials, tokens, secret values, cross-tenant information, or external systems. Do not claim that you can see them. Never request, reproduce, infer, or expose secrets. Never execute actions, alter configuration, make compliance guarantees, or provide a security assurance. If asked for a specific policy decision, explain how the operator can inspect Action Trace, Policy Governance, and redacted evidence rather than inventing an answer. Keep responses concise, practical, and explicitly distinguish implemented controls from customer-controlled activation prerequisites such as Vault, SIEM, or IdP connections.`;
}

function responseText(content: unknown) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: "text"; text: string } => Boolean(part) && typeof part === "object" && "type" in part && part.type === "text" && "text" in part && typeof part.text === "string")
    .map(part => part.text)
    .join("\n");
}

export async function generateAiAssistantReply(input: { question: string; currentPage: AiAssistantPageId }) {
  const prepared = prepareAssistantQuestion(input.question);
  const catalog = await listLLMModels();
  const model = catalog.data.find(entry => entry.id === "gpt-5-mini")?.id ?? catalog.data[0]?.id;
  const response = await invokeLLM({
    model,
    maxTokens: 700,
    messages: [
      { role: "system", content: buildAssistantSystemPrompt(input.currentPage) },
      { role: "user", content: prepared.text },
    ],
  });
  const rawAnswer = response.choices[0]?.message?.content;
  const answer = rawAnswer ? redactAssistantText(responseText(rawAnswer)).text.trim() : "I could not generate guidance for that question. Please try again.";
  return {
    answer: answer || "I could not generate guidance for that question. Please try again.",
    inputRedacted: prepared.redactions > 0,
  };
}
