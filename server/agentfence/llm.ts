import { invokeLLM, listLLMModels } from "../_core/llm";

export function buildExplanationPrompt(event: {
  decision: string;
  reason: string;
  toolName: string;
  action: string;
  dataSensitivity: string;
  destination: string;
}) {
  return `Explain this AgentFence policy result to a security operator. Do not claim that a policy result guarantees security. Provide a concise explanation, one immediate remediation step, and one policy-improvement suggestion. Use only the supplied redacted facts.\n\nDecision: ${event.decision}\nReason: ${event.reason}\nTool: ${event.toolName}\nAction: ${event.action}\nData sensitivity: ${event.dataSensitivity}\nDestination: ${event.destination}`;
}

export async function generatePolicyExplanation(event: {
  decision: string;
  reason: string;
  toolName: string;
  action: string;
  dataSensitivity: string;
  destination: string;
}) {
  const catalog = await listLLMModels();
  const model = catalog.data.find(entry => entry.id === "gpt-5-mini")?.id ?? catalog.data[0]?.id;
  const response = await invokeLLM({
    model,
    messages: [
      {
        role: "system",
        content: "You are a precise enterprise security assistant. Never invent evidence and never reproduce secrets or sensitive data.",
      },
      { role: "user", content: buildExplanationPrompt(event) },
    ],
  });
  return response.choices[0]?.message?.content ?? "No explanation was generated.";
}

export async function generatePolicyPatternSuggestions(events: Array<{
  toolName: string;
  action: string;
  dataSensitivity: string;
  destination: string;
  decision: string;
}>) {
  const catalog = await listLLMModels();
  const model = catalog.data.find(entry => entry.id === "gpt-5-mini")?.id ?? catalog.data[0]?.id;
  const response = await invokeLLM({
    model,
    messages: [
      {
        role: "system",
        content: "You are an enterprise security analyst. Analyze only the supplied redacted decision metadata. Identify recurring policy friction, propose at most three concrete policy improvements, and state uncertainty where evidence is insufficient. Never fabricate incidents or compliance claims.",
      },
      { role: "user", content: `Redacted blocked or approval-gated events:\n${JSON.stringify(events)}` },
    ],
  });
  return response.choices[0]?.message?.content ?? "No pattern suggestions were generated.";
}
