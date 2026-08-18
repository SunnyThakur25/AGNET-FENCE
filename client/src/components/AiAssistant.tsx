import { useAgentFenceWorkspace } from "@/contexts/AgentFenceContext";
import { trpc } from "@/lib/trpc";
import { Bot, CircleHelp, Loader2, LockKeyhole, SendHorizontal, ShieldCheck, Sparkles, X } from "lucide-react";
import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type AssistantPage = "command_center" | "agents" | "policies" | "policy_governance" | "gateway" | "mcp_gateway" | "operations" | "coverage" | "integrations" | "secure_connectors" | "team" | "billing" | "action_capture" | "action_trace" | "approvals" | "audit" | "data_guard" | "vault" | "tests" | "compliance" | "settings" | "account" | "other";
type ChatMessage = { id: number; role: "user" | "assistant"; content: string };

const routeContext: Array<{ prefix: string; page: AssistantPage }> = [
  { prefix: "/policy-governance", page: "policy_governance" },
  { prefix: "/mcp-gateway", page: "mcp_gateway" },
  { prefix: "/secure-connectors", page: "secure_connectors" },
  { prefix: "/action-capture", page: "action_capture" },
  { prefix: "/action-trace", page: "action_trace" },
  { prefix: "/audit-anchoring", page: "audit" },
  { prefix: "/operational-readiness", page: "operations" },
  { prefix: "/integrations", page: "integrations" },
  { prefix: "/operations", page: "operations" },
  { prefix: "/coverage", page: "coverage" },
  { prefix: "/gateway", page: "gateway" },
  { prefix: "/approvals", page: "approvals" },
  { prefix: "/audit", page: "audit" },
  { prefix: "/data-guard", page: "data_guard" },
  { prefix: "/vault", page: "vault" },
  { prefix: "/tests", page: "tests" },
  { prefix: "/compliance", page: "compliance" },
  { prefix: "/settings", page: "settings" },
  { prefix: "/agents", page: "agents" },
  { prefix: "/policies", page: "policies" },
  { prefix: "/team", page: "team" },
  { prefix: "/billing", page: "billing" },
  { prefix: "/profile", page: "account" },
  { prefix: "/security", page: "account" },
  { prefix: "/", page: "command_center" },
];

const promptsByPage: Partial<Record<AssistantPage, string[]>> = {
  policies: ["How should I author a least-privilege policy from scratch?", "What does priority change in policy evaluation?"],
  gateway: ["Why would the Tool Gateway block an action?", "What is evaluated before an integrated action runs?"],
  action_trace: ["How should I interpret each Action Trace step?", "Where can I investigate a blocked action safely?"],
  data_guard: ["What does Data Guard inspect and redact?", "How should I respond to a sensitive-data finding?"],
  vault: ["What is required to activate Vault AppRole safely?", "Why does AgentFence use credential references instead of raw secrets?"],
  mcp_gateway: ["How does Native MCP Gateway trust and scope a tool?", "What must be certified before an MCP server is enabled?"],
  compliance: ["What evidence can AgentFence export for a security review?", "What is the difference between evidence and compliance certification?"],
};

export const AI_ASSISTANT_BOUNDARY_MESSAGE = "Guidance only. No access to tenant records, secrets, tokens, or external systems.";

export function pageForAssistantPath(path: string): AssistantPage {
  return routeContext.find(entry => entry.prefix === "/" ? path === "/" : path.startsWith(entry.prefix))?.page ?? "other";
}

export default function AiAssistant() {
  const [location] = useLocation();
  const { organizationId, ready } = useAgentFenceWorkspace();
  const currentPage = pageForAssistantPath(location);
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesEnd = useRef<HTMLDivElement | null>(null);
  const chat = trpc.aiAssistant.chat.useMutation();
  const prompts = useMemo(() => promptsByPage[currentPage] ?? ["How does AgentFence govern AI-agent actions?", "Where should I start when connecting a new agent?"], [currentPage]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, chat.isPending]);

  const ask = async (rawQuestion: string) => {
    const trimmed = rawQuestion.trim();
    if (!trimmed || !organizationId || !ready || chat.isPending) return;
    const userMessage = { id: Date.now(), role: "user" as const, content: trimmed };
    setMessages(current => [...current, userMessage]);
    setQuestion("");
    try {
      const result = await chat.mutateAsync({ organizationId, question: trimmed, currentPage });
      setMessages(current => [...current, { id: Date.now() + 1, role: "assistant", content: result.answer }]);
      if (result.inputRedacted) toast.info("Credential-like text was redacted before guidance was generated.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Guidance is temporarily unavailable. Please try again.";
      setMessages(current => [...current, { id: Date.now() + 1, role: "assistant", content: `I could not complete that guidance request. ${detail}` }]);
    }
  };

  const submit = (event: FormEvent) => { event.preventDefault(); void ask(question); };

  return <div className="assistant-root">
    {open && <section className="assistant-panel" role="dialog" aria-modal="false" aria-labelledby="assistant-title">
      <header className="assistant-header"><div className="assistant-header-icon"><Bot size={18} /></div><div><p className="assistant-eyebrow">Contextual operator guidance</p><h2 id="assistant-title">AgentFence Guide</h2></div><button type="button" className="assistant-close" aria-label="Close AgentFence Guide" onClick={() => setOpen(false)}><X size={18} /></button></header>
      <div className="assistant-boundary"><LockKeyhole size={15} /><span>{AI_ASSISTANT_BOUNDARY_MESSAGE}</span></div>
      <div className="assistant-messages" aria-live="polite">
        {messages.length === 0 && <div className="assistant-welcome"><div className="assistant-welcome-mark"><Sparkles size={18} /></div><h3>How can I help?</h3><p>Ask how a control works, how to complete an operator workflow, or how to interpret a policy decision. I will not change controls or ask for secrets.</p><div className="assistant-prompt-stack">{prompts.map(prompt => <button type="button" key={prompt} onClick={() => void ask(prompt)} disabled={!ready || chat.isPending}>{prompt}</button>)}</div></div>}
        {messages.map(message => <article className={`assistant-message ${message.role}`} key={message.id}>{message.role === "assistant" ? <Bot size={15} /> : <span className="assistant-user-mark">You</span>}<div><p>{message.content}</p></div></article>)}
        {chat.isPending && <article className="assistant-message assistant"><Loader2 size={15} className="animate-spin" /><p>Reviewing the AgentFence control model…</p></article>}
        <div ref={messagesEnd} />
      </div>
      <form className="assistant-composer" onSubmit={submit}><label className="sr-only" htmlFor="agentfence-guide-question">Ask AgentFence Guide</label><textarea id="agentfence-guide-question" value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask about this screen or a control…" maxLength={2000} rows={2} disabled={!ready || chat.isPending} /><button type="submit" aria-label="Send guidance question" disabled={!ready || chat.isPending || question.trim().length < 3}>{chat.isPending ? <Loader2 size={17} className="animate-spin" /> : <SendHorizontal size={17} />}</button></form>
      <footer className="assistant-footer"><ShieldCheck size={13} /> <span>Conversation remains in this browser session. Validate consequential changes through normal review workflows.</span></footer>
    </section>}
    <button type="button" className="assistant-launcher" aria-label={open ? "Close AgentFence Guide" : "Open AgentFence Guide"} aria-expanded={open} aria-controls="agentfence-guide" onClick={() => setOpen(value => !value)}><span><CircleHelp size={21} /><i /></span><strong>Ask AgentFence</strong></button>
  </div>;
}
