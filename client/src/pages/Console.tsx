import { useAgentFenceWorkspace } from "@/contexts/AgentFenceContext";
import { AGENTFENCE_OWASP_CONTROL_MATRIX, OWASP_AGENTIC_TOP10 } from "@shared/owaspAgentic";
import { trpc } from "@/lib/trpc";
import { Activity, ArrowDownUp, Check, ChevronRight, CircleAlert, Cloud, Clock3, Code2, Copy, FileCheck2, GitBranch, Info, KeyRound, Laptop, Loader2, LockKeyhole, Play, Plus, Radar, Rocket, ScanLine, Search, Settings2, ShieldAlert, ShieldCheck, Sparkles, TriangleAlert, X } from "lucide-react";
import React, { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type Tone = "neutral" | "good" | "warn" | "danger" | "info";

const toneClasses: Record<Tone, string> = {
  neutral: "badge-neutral",
  good: "badge-good",
  warn: "badge-warn",
  danger: "badge-danger",
  info: "badge-info",
};

function decisionTone(decision: string): Tone {
  if (["allowed", "approved", "passed"].includes(decision)) return "good";
  if (["blocked", "rejected", "failed"].includes(decision)) return "danger";
  if (["approval_required", "pending", "needs_review"].includes(decision)) return "warn";
  return "info";
}

function formatTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function pretty(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

type CaptureSort = "newest" | "oldest" | "agent" | "intent" | "policy" | "outcome";
type CaptureLike = { toolName: string; action: string; agentName: string; agentIdentity: string; destination: string; policyName: string | null; decision: string; targetOutcome: string | null; createdAt: Date | string; targetRecordedAt: Date | string | null };

export function captureOutcome(item: { targetOutcome: string | null; decision: string }) {
  return item.targetOutcome ?? item.decision;
}

export function filterAndSortCapturedActions<T extends CaptureLike>(items: T[], search: string, decisionFilter: string, sort: CaptureSort) {
  const needle = search.trim().toLowerCase();
  return items.filter(item => {
    const searchable = [item.toolName, item.action, item.agentName, item.agentIdentity, item.destination, item.policyName ?? "", item.decision, item.targetOutcome ?? ""].join(" ").toLowerCase();
    return (decisionFilter === "all" || item.decision === decisionFilter || item.targetOutcome === decisionFilter) && (!needle || searchable.includes(needle));
  }).sort((left, right) => {
    if (sort === "oldest") return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    if (sort === "agent") return left.agentName.localeCompare(right.agentName);
    if (sort === "intent") return `${left.toolName}.${left.action}`.localeCompare(`${right.toolName}.${right.action}`);
    if (sort === "policy") return (left.policyName ?? "Default-deny path").localeCompare(right.policyName ?? "Default-deny path");
    if (sort === "outcome") return captureOutcome(left).localeCompare(captureOutcome(right));
    return new Date(right.targetRecordedAt ?? right.createdAt).getTime() - new Date(left.targetRecordedAt ?? left.createdAt).getTime();
  });
}

export function isTraceLive(action: { decision: string; targetOutcome: string | null }, isFetching: boolean) {
  return isFetching || (action.decision === "allowed" && !action.targetOutcome);
}

export const FIRST_AGENT_ONBOARDING_STEPS = ["Choose runtime", "Register identity", "Set first boundary", "Wrap a real action"] as const;

export function canAdvanceFirstAgentOnboarding(step: number, values: { runtime: string; name: string; identity: string; tool: string; action: string; destination: string }) {
  if (step === 0) return values.runtime === "cloud" || values.runtime === "browser";
  if (step === 1) return values.name.trim().length >= 2 && /^[a-z0-9._:-]{3,}$/i.test(values.identity.trim());
  if (step === 2) return values.tool.trim().length > 0 && values.action.trim().length > 0 && values.destination.trim().length > 0;
  return true;
}

export function TraceHopTooltip({ id, intent, policy, decision, dataGuard, targetOutcome }: { id?: string; intent: string; policy: string; decision: string; dataGuard: string; targetOutcome: string }) {
  return <div className="trace-tooltip" id={id} role="tooltip"><div><Info size={13} /><strong>Step detail</strong></div><dl><dt>Intent</dt><dd>{intent}</dd><dt>Policy</dt><dd>{policy}</dd><dt>Decision</dt><dd>{decision}</dd><dt>Data Guard</dt><dd>{dataGuard}</dd><dt>Target outcome</dt><dd>{targetOutcome}</dd></dl></div>;
}

export function WorkspacePending() {
  return (
    <div className="h-[60vh] grid place-items-center">
      <div className="flex flex-col items-center gap-3 text-slate-400">
        <Loader2 className="text-cyan-300 animate-spin" size={22} />
        <span className="text-sm">Establishing the protected workspace…</span>
      </div>
    </div>
  );
}

function useWorkspaceData() {
  const workspace = useAgentFenceWorkspace();
  const query = trpc.agentfence.workspace.get.useQuery(
    { organizationId: workspace.organizationId ?? 0 },
    { enabled: workspace.ready },
  );
  return { ...workspace, workspaceQuery: query, teamId: query.data?.memberships?.[0]?.teamId ?? null };
}

export function PageFrame({ eyebrow, title, description, action, children }: { eyebrow: string; title: string; description: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="page-title">{title}</h1>
          <p className="page-description">{description}</p>
        </div>
        {action}
      </header>
      {children}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`status-badge ${toneClasses[tone]}`}>{children}</span>;
}

function EmptyState({ icon: Icon, title, detail }: { icon: typeof ShieldCheck; title: string; detail: string }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Icon size={21} /></div>
      <div>
        <p className="font-medium text-slate-100">{title}</p>
        <p className="mt-1 text-sm leading-6 text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field-wrap">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function PrimaryButton({ children, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`btn-primary ${className}`}>{children}</button>;
}

export function SecondaryButton({ children, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`btn-secondary ${className}`}>{children}</button>;
}

type ActionSummaryItem = { key: string; toolName: string; action: string; count: number; completed: number; succeeded: number; failed: number; pending: number; successRate: number | null };
type ActionSummaryConfig = { sort: "frequency" | "success"; limit: 3 | 5 | 8; collapsed: boolean };
const defaultActionSummaryConfig: ActionSummaryConfig = { sort: "frequency", limit: 5, collapsed: false };

export function ActionSummaryWidget({ totalActions, windowStart, items }: { totalActions: number; windowStart: Date | string; items: ActionSummaryItem[] }) {
  const [config, setConfig] = useState<ActionSummaryConfig>(() => {
    if (typeof window === "undefined") return defaultActionSummaryConfig;
    try {
      const stored = JSON.parse(localStorage.getItem("agentfence:action-summary-config") || "null") as Partial<ActionSummaryConfig> | null;
      return { ...defaultActionSummaryConfig, ...stored };
    } catch {
      return defaultActionSummaryConfig;
    }
  });
  useEffect(() => { localStorage.setItem("agentfence:action-summary-config", JSON.stringify(config)); }, [config]);
  const orderedItems = [...items].sort((left, right) => config.sort === "success" ? (right.successRate ?? -1) - (left.successRate ?? -1) || right.count - left.count : right.count - left.count || (right.successRate ?? -1) - (left.successRate ?? -1)).slice(0, config.limit);
  return <section className="console-card action-summary-widget" aria-labelledby="action-summary-title"><div className="card-heading"><div><p className="card-kicker">Runtime intelligence · last 24 hours</p><h2 id="action-summary-title">Most frequent agent actions</h2><p className="widget-subtitle">{totalActions} governed action{totalActions === 1 ? "" : "s"} since {formatTime(windowStart)}</p></div><div className="widget-actions"><label className="widget-select"><span className="sr-only">Sort action summary</span><select aria-label="Sort action summary" value={config.sort} onChange={event => setConfig(current => ({ ...current, sort: event.target.value as ActionSummaryConfig["sort"] }))}><option value="frequency">Most frequent</option><option value="success">Highest success rate</option></select></label><label className="widget-select"><span className="sr-only">Visible action rows</span><select aria-label="Visible action rows" value={config.limit} onChange={event => setConfig(current => ({ ...current, limit: Number(event.target.value) as ActionSummaryConfig["limit"] }))}><option value={3}>3 rows</option><option value={5}>5 rows</option><option value={8}>8 rows</option></select></label><button type="button" className="icon-button" aria-expanded={!config.collapsed} aria-controls="action-summary-list" aria-label={config.collapsed ? "Expand action summary" : "Collapse action summary"} onClick={() => setConfig(current => ({ ...current, collapsed: !current.collapsed }))}><ChevronRight size={16} className={config.collapsed ? "" : "rotate-90 transition-transform"} /></button></div></div>{!config.collapsed && (orderedItems.length ? <div className="action-summary-list" id="action-summary-list">{orderedItems.map(item => <div className="action-summary-row" key={item.key}><div className="action-summary-icon"><Activity size={14} /></div><div className="action-summary-main"><div className="action-summary-title"><strong>{item.toolName}.{item.action}</strong><span>{item.count} call{item.count === 1 ? "" : "s"}</span></div><div className="action-summary-track" aria-label={`${item.successRate === null ? "No completed outcomes" : `${item.successRate}% success rate`}`}><span style={{ width: `${item.successRate ?? 0}%` }} /></div><div className="action-summary-meta"><span>{item.successRate === null ? "No completed outcomes" : `${item.successRate}% success`}</span><span>{item.succeeded} succeeded · {item.failed} failed · {item.pending} pending</span></div></div><Badge tone={item.successRate === null ? "neutral" : item.successRate >= 80 ? "good" : item.successRate >= 50 ? "warn" : "danger"}>{item.successRate === null ? "Pending" : `${item.successRate}%`}</Badge></div>)}</div> : <EmptyState icon={Activity} title="No governed actions yet" detail="Route a cloud or browser-agent action through the gateway to populate this 24-hour summary." />)}</section>;
}

export function CommandCenter() {
  const { organizationId, ready } = useAgentFenceWorkspace();
  const overview = trpc.agentfence.dashboard.overview.useQuery({ organizationId: organizationId ?? 0 }, { enabled: ready });
  const notifications = trpc.agentfence.notifications.list.useQuery({ organizationId: organizationId ?? 0 }, { enabled: ready, refetchInterval: 15000 });

  if (!ready) return <WorkspacePending />;
  const metrics = overview.data?.metrics;
  const cards = [
    { label: "Active Agents", value: metrics?.activeAgents ?? 0, detail: "Identities with active runtime status", icon: Radar, tone: "cyan" },
    { label: "Protected Policies", value: metrics?.protectedPolicies ?? 0, detail: "Active least-privilege rules", icon: ShieldCheck, tone: "emerald" },
    { label: "Pending Approvals", value: metrics?.pendingApprovals ?? 0, detail: "High-impact actions awaiting review", icon: Clock3, tone: "amber" },
    { label: "Data Guard Findings", value: metrics?.dataGuardFindings ?? 0, detail: "Redaction or detection events", icon: LockKeyhole, tone: "rose" },
  ];

  return (
    <PageFrame eyebrow="Runtime Monitoring Dashboard" title="Command center" description="Full visibility and control over every action your AI agents take.">
      <section className="metric-grid">
        {cards.map(card => (
          <article className="metric-card" key={card.label}>
            <div className={`metric-icon metric-${card.tone}`}><card.icon size={18} /></div>
            <p className="metric-label">{card.label}</p>
            <p className="metric-value">{card.value}</p>
            <p className="metric-detail">{card.detail}</p>
          </article>
        ))}
      </section>

      <ActionSummaryWidget totalActions={overview.data?.actionSummary?.totalActions ?? 0} windowStart={overview.data?.actionSummary?.windowStart ?? new Date()} items={overview.data?.actionSummary?.items ?? []} />

      <section className="agent-fence-explainer">
        <div className="explainer-copy"><p className="eyebrow">Agent firewall, explained</p><h2>AgentFence governs actions—not conversations.</h2><p>Before an agent can call a tool, AgentFence checks its identity, the policy scope, data sensitivity, destination, and whether a human must approve the action.</p></div>
        <div className="explainer-path" aria-label="AI agent decision flow"><span>AI agent</span><i>→</i><strong>Identity + policy + data guard</strong><i>→</i><span>Allow · block · approve</span></div>
      </section>

      <section className="split-grid">
        <article className="console-card span-two">
          <div className="card-heading">
            <div><p className="card-kicker">Tamper-Evident Audit Ledger</p><h2>Recent decisions</h2></div>
            <span className="live-indicator"><span /> Live</span>
          </div>
          {overview.isLoading ? <div className="loading-row"><Loader2 className="animate-spin" size={16} /> Loading ledger…</div> : overview.data?.recentEvents?.length ? (
            <div className="event-list">
              {overview.data.recentEvents.map(event => (
                <div className="event-row" key={event.id}>
                  <div className="event-icon"><ShieldCheck size={15} /></div>
                  <div className="min-w-0 flex-1"><p className="event-title">{pretty(event.eventType)}</p><p className="event-subtitle">{event.actorIdentity} · Sequence #{event.sequence}</p></div>
                  <Badge tone={decisionTone(event.outcome)}>{pretty(event.outcome)}</Badge>
                  <span className="event-time">{formatTime(event.createdAt)}</span>
                </div>
              ))}
            </div>
          ) : <EmptyState icon={ShieldCheck} title="The ledger is ready" detail="Enforcement decisions, approvals, and policy changes will be chained here as activity begins." />}
        </article>

        <article className="console-card">
          <div className="card-heading"><div><p className="card-kicker">Instant Notifications</p><h2>Security signals</h2></div><CircleAlert size={18} className="text-amber-300" /></div>
          {notifications.data?.length ? <div className="signal-stack">{notifications.data.slice(0, 4).map(signal => <div key={signal.id} className="signal-row"><Badge tone={signal.severity === "critical" ? "danger" : signal.severity === "high" ? "warn" : "info"}>{pretty(signal.severity)}</Badge><div className="min-w-0"><p>{signal.title}</p><span>{formatTime(signal.createdAt)}</span></div></div>)}</div> : <EmptyState icon={CircleAlert} title="No active signals" detail="Blocked high-risk actions and approval requests will notify operators here." />}
        </article>
      </section>

      <section className="security-brief">
        <div className="brief-radar"><div className="radar-ring ring-one" /><div className="radar-ring ring-two" /><div className="radar-line" /><ShieldCheck size={22} /></div>
        <div><p className="eyebrow">Security posture</p><h2>Zero-trust enforcement is ready to establish control.</h2><p>Register an agent, assign least-privilege policies, and route consequential tool calls through the Tool Gateway before execution.</p></div>
        <ChevronRight className="hidden md:block text-cyan-300" size={25} />
      </section>
    </PageFrame>
  );
}

export function AgentRegistry() {
  const { organizationId, ready, teamId } = useWorkspaceData();
  const list = trpc.agentfence.agents.list.useQuery({ organizationId: organizationId ?? 0 }, { enabled: ready });
  const [open, setOpen] = useState(false);
  const create = trpc.agentfence.agents.create.useMutation({ onSuccess: () => { toast.success("Agent identity registered"); setOpen(false); list.refetch(); } });
  const statusMutation = trpc.agentfence.agents.setStatus.useMutation({ onSuccess: () => list.refetch() });
  const [form, setForm] = useState({ name: "", identity: "", description: "", environment: "development" as const, riskLevel: "medium" as const });
  if (!ready) return <WorkspacePending />;
  const submit = (event: FormEvent) => { event.preventDefault(); if (!teamId) return toast.error("The workspace team is not ready yet."); create.mutate({ organizationId: organizationId!, teamId, ...form }); };
  return <PageFrame eyebrow="Agent Registry" title="Agent identities" description="Create, manage, and assign identities to AI agents, tracking their environment, owner, risk level, and operational status." action={<PrimaryButton onClick={() => setOpen(true)}><Plus size={16} /> Register agent</PrimaryButton>}>
    <section className="console-card overflow-hidden">
      <div className="card-heading"><div><p className="card-kicker">Protected inventory</p><h2>Registered agents</h2></div><Badge tone="info">{list.data?.length ?? 0} identities</Badge></div>
      {list.data?.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Agent</th><th>Identity</th><th>Environment</th><th>Risk level</th><th>Operational status</th><th /></tr></thead><tbody>{list.data.map(agent => <tr key={agent.id}><td><p className="font-medium text-slate-100">{agent.name}</p><span>{agent.description || "No description provided"}</span></td><td><code>{agent.identity}</code></td><td><Badge tone="neutral">{agent.environment}</Badge></td><td><Badge tone={agent.riskLevel === "critical" || agent.riskLevel === "high" ? "danger" : agent.riskLevel === "medium" ? "warn" : "good"}>{agent.riskLevel}</Badge></td><td><Badge tone={agent.status === "active" ? "good" : "neutral"}>{agent.status}</Badge></td><td className="text-right">{agent.status === "active" ? <SecondaryButton disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ organizationId: organizationId!, agentId: agent.id, status: "paused" })}>Pause</SecondaryButton> : <SecondaryButton disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ organizationId: organizationId!, agentId: agent.id, status: "active" })}>Activate</SecondaryButton>}</td></tr>)}</tbody></table></div> : <EmptyState icon={Radar} title="No agents registered" detail="Register each action-taking agent with its own distinct identity before connecting tools or credentials." />}
    </section>
    {open && <div className="modal-backdrop"><form onSubmit={submit} className="modal-panel"><div className="modal-head"><div><p className="eyebrow">Agent Registry</p><h2>Register an agent</h2></div><button type="button" className="icon-button" onClick={() => setOpen(false)}><X size={18} /></button></div><div className="form-grid"><Field label="Agent name"><input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Customer resolution agent" /></Field><Field label="Agent identity" hint="Stable workload identifier; not a shared API key."><input required value={form.identity} onChange={e => setForm({ ...form, identity: e.target.value })} placeholder="support.resolution.prod" /></Field><Field label="Environment"><select value={form.environment} onChange={e => setForm({ ...form, environment: e.target.value as typeof form.environment })}><option value="development">Development</option><option value="staging">Staging</option><option value="production">Production</option></select></Field><Field label="Risk level"><select value={form.riskLevel} onChange={e => setForm({ ...form, riskLevel: e.target.value as typeof form.riskLevel })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></Field><Field label="Operational description"><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What this agent is allowed to accomplish." /></Field></div><div className="modal-footer"><SecondaryButton type="button" onClick={() => setOpen(false)}>Cancel</SecondaryButton><PrimaryButton disabled={create.isPending}>{create.isPending ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />} Register identity</PrimaryButton></div></form></div>}
  </PageFrame>;
}

export function PolicyEngine() {
  const { organizationId, ready } = useAgentFenceWorkspace();
  const policiesQuery = trpc.agentfence.policies.list.useQuery({ organizationId: organizationId ?? 0 }, { enabled: ready });
  const agentsQuery = trpc.agentfence.agents.list.useQuery({ organizationId: organizationId ?? 0 }, { enabled: ready });
  const [open, setOpen] = useState(false);
  const create = trpc.agentfence.policies.create.useMutation({ onSuccess: () => { toast.success("Least-privilege policy activated"); setOpen(false); policiesQuery.refetch(); } });
  const status = trpc.agentfence.policies.setStatus.useMutation({ onSuccess: () => policiesQuery.refetch() });
  const [form, setForm] = useState({ name: "", effect: "allow" as const, agentId: "", toolPattern: "*", actionPattern: "*", dataSensitivity: "any" as const, destinationPattern: "*", priority: "100", description: "" });
  if (!ready) return <WorkspacePending />;
  const submit = (event: FormEvent) => { event.preventDefault(); create.mutate({ organizationId: organizationId!, name: form.name, description: form.description || undefined, effect: form.effect, agentId: form.agentId ? Number(form.agentId) : undefined, toolPattern: form.toolPattern, actionPattern: form.actionPattern, dataSensitivity: form.dataSensitivity, destinationPattern: form.destinationPattern, priority: Number(form.priority) }); };
  return <PageFrame eyebrow="Policy Engine" title="Least-privilege policies" description="Define and enforce allow/deny rules per agent covering tools, actions, parameters, data sensitivity, and destinations." action={<PrimaryButton onClick={() => setOpen(true)}><Plus size={16} /> Create policy</PrimaryButton>}>
    <div className="policy-principle"><ShieldCheck size={19} /><div><strong>Default-deny evaluation</strong><span>When no active policy explicitly grants a tool action, the Tool Gateway blocks it.</span></div></div>
    <section className="console-card overflow-hidden">{policiesQuery.data?.length ? <div className="policy-stack">{policiesQuery.data.map(policy => <article className="policy-row" key={policy.id}><div className={`policy-effect effect-${policy.effect}`}><ShieldAlert size={17} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3>{policy.name}</h3><Badge tone={policy.effect === "allow" ? "good" : policy.effect === "deny" ? "danger" : "warn"}>{pretty(policy.effect)}</Badge><Badge tone={policy.status === "active" ? "good" : "neutral"}>{policy.status}</Badge></div><p>{policy.description || `${policy.toolPattern}.${policy.actionPattern} → ${policy.destinationPattern}`}</p><div className="policy-chips"><code>tool: {policy.toolPattern}</code><code>action: {policy.actionPattern}</code><code>data: {policy.dataSensitivity}</code><code>destination: {policy.destinationPattern}</code><span>priority {policy.priority}</span></div></div>{policy.status === "active" ? <SecondaryButton disabled={status.isPending} onClick={() => status.mutate({ organizationId: organizationId!, policyId: policy.id, status: "disabled" })}>Disable</SecondaryButton> : <SecondaryButton disabled>Review revision</SecondaryButton>}</article>)}</div> : <EmptyState icon={ShieldAlert} title="No enforcement policies" detail="Create a narrow allow, deny, or require approval rule before any agent can execute actions through the Tool Gateway." />}</section>
    {open && <div className="modal-backdrop"><form onSubmit={submit} className="modal-panel"><div className="modal-head"><div><p className="eyebrow">Policy Engine</p><h2>Create policy</h2></div><button type="button" className="icon-button" onClick={() => setOpen(false)}><X size={18} /></button></div><div className="form-grid"><Field label="Policy name"><input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Require approval for refunds" /></Field><Field label="Effect"><select value={form.effect} onChange={e => setForm({ ...form, effect: e.target.value as typeof form.effect })}><option value="allow">Allow</option><option value="deny">Deny</option><option value="require_approval">Require approval</option></select></Field><Field label="Target agent"><select value={form.agentId} onChange={e => setForm({ ...form, agentId: e.target.value })}><option value="">All agents in workspace</option>{agentsQuery.data?.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></Field><Field label="Priority"><input required type="number" min="0" max="1000" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} /></Field><Field label="Tool pattern"><input required value={form.toolPattern} onChange={e => setForm({ ...form, toolPattern: e.target.value })} placeholder="payments or *" /></Field><Field label="Action pattern"><input required value={form.actionPattern} onChange={e => setForm({ ...form, actionPattern: e.target.value })} placeholder="issue_refund or *" /></Field><Field label="Data sensitivity"><select value={form.dataSensitivity} onChange={e => setForm({ ...form, dataSensitivity: e.target.value as typeof form.dataSensitivity })}><option value="any">Any</option><option value="public">Public</option><option value="internal">Internal</option><option value="pii">PII</option><option value="phi">PHI</option><option value="payment">Payment data</option><option value="secret">Secret</option></select></Field><Field label="Destination pattern"><input required value={form.destinationPattern} onChange={e => setForm({ ...form, destinationPattern: e.target.value })} placeholder="internal or *" /></Field><Field label="Description"><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Explain the guardrail and intended business control." /></Field></div><div className="modal-footer"><SecondaryButton type="button" onClick={() => setOpen(false)}>Cancel</SecondaryButton><PrimaryButton disabled={create.isPending}>{create.isPending ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />} Activate policy</PrimaryButton></div></form></div>}
  </PageFrame>;
}

export function ToolGateway() {
  const { organizationId, ready } = useAgentFenceWorkspace();
  const agentsQuery = trpc.agentfence.agents.list.useQuery({ organizationId: organizationId ?? 0 }, { enabled: ready });
  const gateway = trpc.agentfence.gateway.evaluate.useMutation();
  const [form, setForm] = useState({ agentId: "", toolName: "", action: "", parameters: "{}", dataSensitivity: "internal" as const, destination: "internal", riskLevel: "medium" as const });
  const [result, setResult] = useState<ReturnType<typeof gateway.mutateAsync> extends Promise<infer T> ? T | null : null>(null);
  if (!ready) return <WorkspacePending />;
  const submit = async (event: FormEvent) => { event.preventDefault(); try { const parameters = JSON.parse(form.parameters); const response = await gateway.mutateAsync({ organizationId: organizationId!, agentId: Number(form.agentId), toolName: form.toolName, action: form.action, parameters, dataSensitivity: form.dataSensitivity, destination: form.destination, riskLevel: form.riskLevel }); setResult(response); toast.success(`Gateway decision: ${pretty(response.decision)}`); } catch (error) { toast.error(error instanceof Error ? error.message : "Provide valid JSON parameters."); } };
  return <PageFrame eyebrow="Tool Gateway" title="Pre-execution control" description="Every agent tool call — API, function, or browser action — is intercepted and evaluated against active policies before it is allowed to execute.">
    <section className="gateway-layout"><form onSubmit={submit} className="console-card gateway-form"><div className="card-heading"><div><p className="card-kicker">Controlled invocation</p><h2>Evaluate tool call</h2></div><Radar size={18} className="text-cyan-300" /></div><div className="form-grid"><Field label="Agent identity"><select required value={form.agentId} onChange={e => setForm({ ...form, agentId: e.target.value })}><option value="">Select registered agent</option>{agentsQuery.data?.filter(agent => agent.status === "active").map(agent => <option key={agent.id} value={agent.id}>{agent.name} · {agent.identity}</option>)}</select></Field><Field label="Tool"><input required value={form.toolName} onChange={e => setForm({ ...form, toolName: e.target.value })} placeholder="payments" /></Field><Field label="Action"><input required value={form.action} onChange={e => setForm({ ...form, action: e.target.value })} placeholder="issue_refund" /></Field><Field label="Risk level"><select value={form.riskLevel} onChange={e => setForm({ ...form, riskLevel: e.target.value as typeof form.riskLevel })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></Field><Field label="Data sensitivity"><select value={form.dataSensitivity} onChange={e => setForm({ ...form, dataSensitivity: e.target.value as typeof form.dataSensitivity })}><option value="public">Public</option><option value="internal">Internal</option><option value="pii">PII</option><option value="phi">PHI</option><option value="payment">Payment data</option><option value="secret">Secret</option></select></Field><Field label="Destination"><input required value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })} placeholder="internal" /></Field><Field label="Parameters (redacted before storage)"><textarea className="font-mono text-xs" value={form.parameters} onChange={e => setForm({ ...form, parameters: e.target.value })} /></Field></div><PrimaryButton disabled={gateway.isPending || !agentsQuery.data?.length}>{gateway.isPending ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />} Evaluate before execution</PrimaryButton></form>
      <article className="gateway-decision"><div className="decision-wire"><span /><span /><span /></div>{result ? <div className="decision-content"><div className={`decision-orb decision-${decisionTone(result.decision)}`}>{result.decision === "allowed" ? <Check size={28} /> : result.decision === "blocked" ? <X size={28} /> : <Clock3 size={28} />}</div><p className="eyebrow">Decision</p><h2>{pretty(result.decision)}</h2><p>{result.reason}</p>{result.matchedPolicy && <div className="decision-meta"><span>Matched policy</span><strong>{result.matchedPolicy}</strong></div>}{result.approvalId && <div className="decision-meta"><span>Approval request</span><strong>#{result.approvalId}</strong></div>}<div className="decision-meta"><span>Data Guard</span><strong>{pretty(result.dataGuard.classification)} · {result.dataGuard.occurrences ? `${result.dataGuard.occurrences} redaction(s)` : "No pattern found"}</strong></div></div> : <div className="decision-content muted"><div className="decision-orb decision-neutral"><ShieldCheck size={28} /></div><p className="eyebrow">Policy decision point</p><h2>Awaiting invocation</h2><p>AgentFence evaluates identity, policy, parameters, data sensitivity, and destination outside the model before allowing an action.</p></div>}</article>
    </section>
  </PageFrame>;
}

export function FirstAgentOnboardingWizard({ organizationId, teamId, onCreated }: { organizationId: number; teamId: number | null; onCreated: (agentId: number) => void }) {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(0);
  const [createdAgentId, setCreatedAgentId] = useState<number | null>(null);
  const [form, setForm] = useState({ runtime: "cloud", name: "", identity: "", environment: "development" as "development" | "staging" | "production", riskLevel: "medium" as "low" | "medium" | "high" | "critical", tool: "crm", action: "customer.read", destination: "crm.company.internal", effect: "require_approval" as "allow" | "deny" | "require_approval" });
  const createAgent = trpc.agentfence.agents.create.useMutation();
  const createPolicy = trpc.agentfence.policies.create.useMutation();
  const busy = createAgent.isPending || createPolicy.isPending;
  const canContinue = canAdvanceFirstAgentOnboarding(step, form) && (step !== 2 || createdAgentId !== null);

  const continueWizard = async () => {
    if (!canAdvanceFirstAgentOnboarding(step, form)) return;
    try {
      if (step === 1) {
        if (!teamId) throw new Error("No organization team is available for agent registration.");
        const result = await createAgent.mutateAsync({ organizationId, teamId, name: form.name.trim(), identity: form.identity.trim(), environment: form.environment, riskLevel: form.riskLevel, description: `${form.runtime === "cloud" ? "Cloud" : "Managed browser"} agent onboarded through the first-agent wizard.` });
        setCreatedAgentId(result.agentId);
        onCreated(result.agentId);
        toast.success("Agent identity registered and audit event written");
      }
      if (step === 2) {
        if (!createdAgentId) throw new Error("Register the agent identity before creating a policy.");
        await createPolicy.mutateAsync({ organizationId, teamId, agentId: createdAgentId, name: `First boundary · ${form.tool}.${form.action}`, description: "Created by the first-agent onboarding wizard. Review and refine before production use.", effect: form.effect, toolPattern: form.tool.trim(), actionPattern: form.action.trim(), dataSensitivity: "internal", destinationPattern: form.destination.trim(), priority: 100 });
        toast.success("First agent boundary policy is active");
      }
      setStep(current => Math.min(current + 1, FIRST_AGENT_ONBOARDING_STEPS.length - 1));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The onboarding step could not be completed.");
    }
  };

  const snippet = form.runtime === "cloud"
    ? `await fence.guardAndDeliver({ toolName: "${form.tool}", action: "${form.action}", destination: "${form.destination}", dataSensitivity: "internal", riskLevel: "${form.riskLevel}" }, deliver);`
    : `await browserFence.authorizeAndExecute({ action: "${form.action}", destination: "${form.destination}", metadata: { tool: "${form.tool}" }, dataSensitivity: "internal", riskLevel: "${form.riskLevel}" }, executeBrowserAction);`;

  return <section className="first-agent-wizard console-card"><div className="card-heading"><div><p className="card-kicker">Guided production onboarding</p><h2>Connect your first real agent</h2><p>Creates a real tenant-scoped identity and first policy. It never issues or displays raw credentials.</p></div><Badge tone={step === 3 ? "good" : "info"}>{step === 3 ? "Ready to wrap" : `Step ${step + 1} of ${FIRST_AGENT_ONBOARDING_STEPS.length}`}</Badge></div><div className="wizard-progress" aria-label={`Onboarding step ${step + 1} of ${FIRST_AGENT_ONBOARDING_STEPS.length}`}>{FIRST_AGENT_ONBOARDING_STEPS.map((label, index) => <div key={label} className={index === step ? "current" : index < step ? "complete" : ""}><span>{index < step ? <Check size={13} /> : index + 1}</span><strong>{label}</strong></div>)}</div><div className="wizard-panel">
    {step === 0 && <div className="wizard-choice-grid"><button type="button" className={form.runtime === "cloud" ? "wizard-choice selected" : "wizard-choice"} onClick={() => setForm({ ...form, runtime: "cloud" })}><Cloud size={22} /><strong>Cloud agent</strong><span>Copilot, workflow, API service, or serverless runtime using the signed SDK.</span></button><button type="button" className={form.runtime === "browser" ? "wizard-choice selected" : "wizard-choice"} onClick={() => setForm({ ...form, runtime: "browser" })}><Laptop size={22} /><strong>Managed browser agent</strong><span>Browser automation, RPA, managed laptop, or VDI using the action adapter.</span></button></div>}
    {step === 1 && <div className="form-grid wizard-form"><Field label="Agent name"><input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Support resolution agent" /></Field><Field label="Workload identity"><input value={form.identity} onChange={event => setForm({ ...form, identity: event.target.value })} placeholder="agent.support.resolution" /></Field><Field label="Environment"><select value={form.environment} onChange={event => setForm({ ...form, environment: event.target.value as typeof form.environment })}><option value="development">Development</option><option value="staging">Staging</option><option value="production">Production</option></select></Field><Field label="Risk level"><select value={form.riskLevel} onChange={event => setForm({ ...form, riskLevel: event.target.value as typeof form.riskLevel })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></Field></div>}
    {step === 2 && <div className="form-grid wizard-form"><Field label="Tool or system"><input value={form.tool} onChange={event => setForm({ ...form, tool: event.target.value })} placeholder="crm" /></Field><Field label="Allowed action"><input value={form.action} onChange={event => setForm({ ...form, action: event.target.value })} placeholder="customer.read" /></Field><Field label="Approved destination"><input value={form.destination} onChange={event => setForm({ ...form, destination: event.target.value })} placeholder="crm.company.internal" /></Field><Field label="Decision mode"><select value={form.effect} onChange={event => setForm({ ...form, effect: event.target.value as typeof form.effect })}><option value="require_approval">Require human approval (recommended first)</option><option value="allow">Allow within this narrow boundary</option><option value="deny">Deny and test containment</option></select></Field><p className="wizard-safety-note"><ShieldCheck size={16} /> This creates a live policy for the registered agent. Start with approval-required in development or staging, test it, then promote only the reviewed boundary.</p></div>}
    {step === 3 && <div className="wizard-code"><div><div className="integration-icon">{form.runtime === "cloud" ? <Cloud size={19} /> : <Laptop size={19} />}</div><p className="card-kicker">{form.runtime === "cloud" ? "Cloud runtime wrapper" : "Browser action wrapper"}</p><h3>Put this immediately before the consequential action.</h3><p>Use an issued short-lived runtime credential on the server or managed device. Do not place it in browser source code or a prompt.</p></div><pre><code>{snippet}</code></pre><div className="wizard-final-actions"><SecondaryButton onClick={() => navigator.clipboard.writeText(snippet).then(() => toast.success("Runtime wrapper copied"))}><Copy size={15} /> Copy wrapper call</SecondaryButton><PrimaryButton onClick={() => navigate("/gateway")}><Rocket size={15} /> Test in Tool Gateway</PrimaryButton></div></div>}
  </div><div className="wizard-actions">{step > 0 && <SecondaryButton onClick={() => setStep(current => current - 1)} disabled={busy}>Back</SecondaryButton>}{step < 3 ? <PrimaryButton onClick={continueWizard} disabled={!canContinue || busy}>{busy ? <Loader2 className="animate-spin" size={15} /> : <ChevronRight size={15} />}{step === 2 ? "Create first boundary" : step === 1 ? "Register agent identity" : "Continue"}</PrimaryButton> : <SecondaryButton onClick={() => { setStep(0); setCreatedAgentId(null); setForm({ ...form, name: "", identity: "" }); }}>Onboard another agent</SecondaryButton>}</div></section>;
}

export function IntegrationHubPage() {
  const { organizationId, ready, teamId } = useWorkspaceData();
  const agentsQuery = trpc.agentfence.agents.list.useQuery({ organizationId: organizationId ?? 0 }, { enabled: ready });
  const [agentId, setAgentId] = useState("");
  if (!ready) return <WorkspacePending />;
  const selectedAgent = agentsQuery.data?.find(agent => agent.id === Number(agentId));
  const cloudSnippet = `import { createAgentFenceRuntimeClient } from "@agentfence/runtime";

const fence = createAgentFenceRuntimeClient({
  endpoint: "https://YOUR_AGENTFENCE_URL",
  credential: "SHORT_LIVED_RUNTIME_CREDENTIAL",
});

await fence.guardAndDeliver({
  toolName: "crm", action: "customer.read",
  parameters: { customerId },
  destination: "crm.company.internal",
  dataSensitivity: "pii", riskLevel: "medium",
}, safePayload => crm.getCustomer(safePayload));`;
  const browserSnippet = `import { createAgentFenceBrowserActionAdapter } from "@agentfence/runtime";

const browserFence = createAgentFenceBrowserActionAdapter({
  endpoint: "https://YOUR_AGENTFENCE_URL",
  credential: "SHORT_LIVED_RUNTIME_CREDENTIAL",
});

await browserFence.authorizeAndExecute({
  action: "form.submit",
  destination: "crm.company.internal",
  metadata: { form: "customer-note" },
  dataSensitivity: "internal", riskLevel: "medium",
}, () => page.click("[data-action=submit-note]"));`;
  const copy = async (value: string) => { await navigator.clipboard.writeText(value); toast.success("Integration example copied"); };
  return <PageFrame eyebrow="Organization integrations" title="Connect any agent in four controlled steps" description="Use the same signed control path for cloud agents, API workflows, browser automation, RPA, managed laptops, and VDI environments. AgentFence captures every governed action automatically—never raw credentials or unredacted sensitive content.">
    <section className="integration-hero"><div><p className="eyebrow">Portable enforcement contract</p><h2>One action gateway. Any approved agent runtime.</h2><p>Cloud agents use the runtime SDK; browser agents use the lightweight browser-action adapter around each navigation, form submission, upload, download, or browser-backed API call.</p></div><div className="integration-protocol"><span>1. identify</span><i>→</i><span>2. policy</span><i>→</i><span>3. scoped credential</span><i>→</i><strong>4. capture + trace</strong></div></section>
    <FirstAgentOnboardingWizard organizationId={organizationId!} teamId={teamId} onCreated={id => { setAgentId(String(id)); agentsQuery.refetch(); }} />
    <section className="console-card"><div className="card-heading"><div><p className="card-kicker">Integration readiness</p><h2>Choose the governed agent</h2></div><Badge tone={selectedAgent ? "good" : "warn"}>{selectedAgent ? "Ready for integration" : "Select an identity"}</Badge></div><div className="integration-steps"><div className="integration-step"><b>01</b><div><strong>Register identity</strong><p>Every runtime has a unique tenant-bound agent identity.</p></div></div><div className="integration-step"><b>02</b><div><strong>Set policies</strong><p>Allow, block, or require approval by tool, action, data, and destination.</p></div></div><div className="integration-step"><b>03</b><div><strong>Issue a short-lived scope</strong><p>Use a Vault-backed reference when live Vault connectivity is configured.</p></div></div><div className="integration-step"><b>04</b><div><strong>Wrap actions</strong><p>Use one helper before the actual cloud or browser action runs.</p></div></div></div><div className="mt-5 max-w-md"><Field label="Agent identity"><select value={agentId} onChange={event => setAgentId(event.target.value)}><option value="">Select a registered agent</option>{agentsQuery.data?.filter(agent => agent.status === "active").map(agent => <option value={agent.id} key={agent.id}>{agent.name} · {agent.identity}</option>)}</select></Field></div></section>
    <section className="integration-grid"><article className="console-card integration-card"><div className="integration-icon"><Cloud size={19} /></div><p className="card-kicker">Cloud SDK pattern</p><h2>APIs, copilots, workflows, and backend agents</h2><p>Keep the real API call inside the delivery callback. AgentFence evaluates the action before the request is released.</p><pre><code>{cloudSnippet}</code></pre><SecondaryButton onClick={() => copy(cloudSnippet)}><Copy size={15} /> Copy cloud example</SecondaryButton></article><article className="console-card integration-card"><div className="integration-icon browser"><Laptop size={19} /></div><p className="card-kicker">Browser wrapper pattern</p><h2>Local browser agents, RPA, VDI, and extensions</h2><p>Place the adapter directly before browser automation. A denied or approval-required action never reaches the page control.</p><pre><code>{browserSnippet}</code></pre><SecondaryButton onClick={() => copy(browserSnippet)}><Copy size={15} /> Copy browser example</SecondaryButton></article></section>
    <section className="privacy-callout"><LockKeyhole size={19} /><div><strong>Capture is safe by design.</strong><p>AgentFence stores redacted action metadata, policy results, approval states, and audit evidence. It is not a keystroke recorder, screen recorder, or raw network-packet collector.</p></div></section>
  </PageFrame>;
}

export function ActionCaptureControls({ search, decisionFilter, sort, visibleCount, onSearch, onDecisionFilter, onSort }: { search: string; decisionFilter: string; sort: CaptureSort; visibleCount: number; onSearch: (value: string) => void; onDecisionFilter: (value: string) => void; onSort: (value: CaptureSort) => void }) {
  return <div className="capture-toolbar"><div><p className="card-kicker">Action stream · {visibleCount} visible</p><h2>Captured requests</h2></div><div className="capture-controls"><label className="capture-search"><Search size={14} /><input aria-label="Search captured actions" value={search} onChange={event => onSearch(event.target.value)} placeholder="Search intent, agent, policy, outcome…" /></label><select aria-label="Filter capture outcome" value={decisionFilter} onChange={event => onDecisionFilter(event.target.value)}><option value="all">All decisions/outcomes</option><option value="allowed">Allowed</option><option value="blocked">Blocked</option><option value="approval_required">Approval required</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="succeeded">Target succeeded</option><option value="failed">Target failed</option></select><label className="sort-control"><ArrowDownUp size={13} /><select aria-label="Sort captured actions" value={sort} onChange={event => onSort(event.target.value as CaptureSort)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="agent">Agent</option><option value="intent">Intent</option><option value="policy">Policy</option><option value="outcome">Outcome</option></select></label></div></div>;
}

export function ActionTraceHopCard({ hop, index, total, live, intent, policy, decision, dataGuard, targetOutcome }: { hop: { id: string; label: string; status: string; detail: string; timestamp: Date | string }; index: number; total: number; live: boolean; intent: string; policy: string; decision: string; dataGuard: string; targetOutcome: string }) {
  return <article className={`trace-hop ${live && index === total - 1 ? "trace-hop-active" : ""}`} key={hop.id}><div className={`trace-node node-${decisionTone(hop.status)}`}><span>{index + 1}</span></div><div className="trace-hop-card" tabIndex={0} aria-describedby={`trace-tooltip-${hop.id}`}><div className="flex flex-wrap items-center gap-2"><h3>{hop.label}</h3><Badge tone={decisionTone(hop.status)}>{pretty(hop.status)}</Badge>{live && index === total - 1 && <span className="trace-live-dot"><span /> Updating</span>}</div><p>{hop.detail}</p><time>{formatTime(hop.timestamp)}</time><TraceHopTooltip id={`trace-tooltip-${hop.id}`} intent={intent} policy={policy} decision={decision} dataGuard={dataGuard} targetOutcome={targetOutcome} /></div>{index < total - 1 && <div className="trace-connector"><i /></div>}</article>;
}

type CaptureRowModel = { id: number; toolName: string; action: string; decision: string; targetOutcome: string | null; targetStatusCode: number | null; targetRecordedAt: Date | null; createdAt: Date; agentName: string; agentIdentity: string; destination: string; riskLevel: string; dataSensitivity: string; policyName: string | null; dataGuardFindings: Array<{ classification: string }>; approval: { status: string } | null };

export function ActionCaptureRows({ actions, onTrace }: { actions: CaptureRowModel[]; onTrace: (id: number) => void }) {
  return <div className="capture-list">{actions.map(item => <article className="capture-row" key={item.id} data-testid={`capture-row-${item.id}`}><div className={`capture-signal signal-${decisionTone(item.targetOutcome === "failed" ? "blocked" : item.decision)}`}><span /></div><div className="capture-main"><div className="flex flex-wrap gap-2 items-center"><strong>{item.toolName}.{item.action}</strong><Badge tone={decisionTone(item.decision)}>{pretty(item.decision)}</Badge>{item.targetOutcome && <Badge tone={item.targetOutcome === "succeeded" ? "good" : "danger"}>Target {item.targetOutcome}</Badge>}{item.approval && <Badge tone={decisionTone(item.approval.status)}>{pretty(item.approval.status)}</Badge>}</div><p>{item.agentName} <code>{item.agentIdentity}</code> → {item.destination}</p><div className="capture-meta"><span>Risk: {item.riskLevel}</span><span>Data: {item.dataSensitivity}</span><span>{item.policyName ? `Policy: ${item.policyName}` : "Default-deny path"}</span><span>{item.dataGuardFindings.length ? `Data Guard: ${item.dataGuardFindings.map(finding => finding.classification).join(", ")}` : "Data Guard: clean"}</span><span>{item.targetOutcome ? `Target: ${item.targetOutcome}${item.targetStatusCode ? ` · ${item.targetStatusCode}` : ""}` : "Target: awaiting report"}</span></div></div><div className="capture-time"><span>{formatTime(item.targetRecordedAt ?? item.createdAt)}</span><SecondaryButton onClick={() => onTrace(item.id)}><GitBranch size={14} /> Trace</SecondaryButton></div></article>)}</div>;
}

export function ActionCapturePage() {
  const { organizationId, ready } = useAgentFenceWorkspace();
  const [, navigate] = useLocation();
  const capture = trpc.agentfence.observability.capture.useQuery({ organizationId: organizationId ?? 0, limit: 120 }, { enabled: ready, refetchInterval: 10000 });
  const [decisionFilter, setDecisionFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<CaptureSort>("newest");
  const actions = useMemo(() => filterAndSortCapturedActions(capture.data ?? [], search, decisionFilter, sort), [capture.data, decisionFilter, search, sort]);
  if (!ready) return <WorkspacePending />;
  const inspect = (toolCallId: number) => { sessionStorage.setItem("agentfence:selected-trace", String(toolCallId)); navigate("/action-trace"); };
  return <PageFrame eyebrow="AI Action Capture" title="Governed action capture" description="A Wireshark-inspired view of every action that passed through AgentFence. Inspect the action intent, policy decision, Data Guard posture, approval state, destination, and the privacy-safe target-system outcome—without storing raw secrets or page content.">
    <section className="capture-hero"><div className="capture-radar"><ScanLine size={25} /><span className="capture-sweep" /></div><div><p className="eyebrow">Metadata-only capture</p><h2>See every governed action as it crosses the fence.</h2><p>Capture records are tenant-scoped and derived from the signed Tool Gateway and runtime path. An allow is a release decision, not a claim that an external system completed a business transaction.</p></div><Badge tone="good">Live refresh · 10s</Badge></section>
            <section className="console-card overflow-hidden"><ActionCaptureControls search={search} decisionFilter={decisionFilter} sort={sort} visibleCount={actions.length} onSearch={setSearch} onDecisionFilter={setDecisionFilter} onSort={setSort} />{capture.isLoading ? <div className="loading-row"><Loader2 className="animate-spin" size={16} /> Loading action capture…</div> : actions.length ? <ActionCaptureRows actions={actions} onTrace={inspect} /> : <EmptyState icon={ScanLine} title="No captured actions" detail="Route a cloud SDK or browser wrapper action through AgentFence; the privacy-safe capture stream will appear here." />}</section>
  </PageFrame>;
}

export function ActionTracePage() {
  const { organizationId, ready } = useAgentFenceWorkspace();
  const capture = trpc.agentfence.observability.capture.useQuery({ organizationId: organizationId ?? 0, limit: 120 }, { enabled: ready, refetchInterval: 5000 });
  const [selectedId, setSelectedId] = useState<number | null>(() => { const stored = sessionStorage.getItem("agentfence:selected-trace"); return stored && /^\d+$/.test(stored) ? Number(stored) : null; });
  useEffect(() => { if (!selectedId && capture.data?.[0]) setSelectedId(capture.data[0].id); }, [capture.data, selectedId]);
  const trace = trpc.agentfence.observability.trace.useQuery({ organizationId: organizationId ?? 0, toolCallId: selectedId ?? 0 }, { enabled: ready && Boolean(selectedId), refetchInterval: 2500 });
  const waitingForTarget = trace.data?.action.decision === "allowed" && !trace.data.action.targetOutcome;
  const live = isTraceLive(trace.data?.action ?? { decision: "info", targetOutcome: null }, trace.isFetching);
  if (!ready) return <WorkspacePending />;
  return <PageFrame eyebrow="AI Action Trace" title="Trace the decision path" description="A traceroute-style representation of one governed AI action. Follow the exact path from agent intent through Data Guard, policy, approval, audit evidence, and the final release or containment boundary.">
    <section className="console-card"><div className="trace-toolbar"><div><p className="card-kicker">Select captured action</p><h2>Action route</h2></div><select value={selectedId ?? ""} onChange={event => { const id = Number(event.target.value); setSelectedId(id); sessionStorage.setItem("agentfence:selected-trace", String(id)); }}><option value="">Select captured action</option>{capture.data?.map(item => <option key={item.id} value={item.id}>#{item.id} · {item.agentName} · {item.toolName}.{item.action} · {pretty(item.decision)}</option>)}</select></div></section>
    {trace.isLoading ? <section className="console-card"><div className="loading-row"><Loader2 className="animate-spin" size={16} /> Building action trace…</div></section> : trace.data ? <><section className="trace-summary"><div><p className="eyebrow">Trace #{trace.data.action.id}</p><h2>{trace.data.action.toolName}.{trace.data.action.action}</h2><p>{trace.data.action.agent.name} <code>{trace.data.action.agent.identity}</code> → {trace.data.action.destination}</p></div><div className="trace-summary-stats"><Badge tone={live ? "info" : decisionTone(trace.data.action.targetOutcome === "failed" ? "failed" : trace.data.action.decision)}>{live && <Activity size={13} className="live-pulse" />}{live ? "Live · awaiting execution state" : trace.data.action.targetOutcome ? `Target ${pretty(trace.data.action.targetOutcome)}` : pretty(trace.data.action.decision)}</Badge><span>Data sensitivity: {trace.data.action.dataSensitivity}</span>{trace.data.policy && <span>Policy: {trace.data.policy.name}</span>}</div></section><section className="trace-rail">{trace.data.hops.map((hop, index) => <ActionTraceHopCard hop={hop} index={index} total={trace.data.hops.length} live={live} intent={`${trace.data.action.toolName}.${trace.data.action.action}`} policy={trace.data.policy?.name ?? "Default-deny path"} decision={pretty(trace.data.action.decision)} dataGuard={trace.data.dataGuardFindings.length ? trace.data.dataGuardFindings.map((finding: { classification: string }) => finding.classification).join(", ") : "No findings"} targetOutcome={trace.data.action.targetOutcome ? pretty(trace.data.action.targetOutcome) : "Awaiting wrapped integration report"} />)}</section><section className="console-card"><div className="card-heading"><div><p className="card-kicker">Tamper-Evident Audit Ledger</p><h2>Related evidence</h2></div><Badge tone="info">{trace.data.auditEvents.length} event{trace.data.auditEvents.length === 1 ? "" : "s"}</Badge></div>{trace.data.auditEvents.length ? <div className="trace-audit-list">{trace.data.auditEvents.map(event => <div key={event.id}><span>{formatTime(event.createdAt)}</span><strong>{pretty(event.eventType)}</strong><Badge tone={decisionTone(event.outcome)}>{pretty(event.outcome)}</Badge></div>)}</div> : <p className="text-sm text-slate-500 pt-4">No related ledger events are currently retained for this captured action.</p>}</section></> : <section className="console-card"><EmptyState icon={GitBranch} title="Select an action to trace" detail="Choose a captured request above to build its governed action route." /></section>}
  </PageFrame>;
}

export function ApprovalsPage() {
  const { organizationId, ready } = useAgentFenceWorkspace();
  const approvalsQuery = trpc.agentfence.approvals.list.useQuery({ organizationId: organizationId ?? 0 }, { enabled: ready });
  const decide = trpc.agentfence.approvals.decide.useMutation({ onSuccess: () => { toast.success("Approval decision captured in the audit ledger"); approvalsQuery.refetch(); } });
  if (!ready) return <WorkspacePending />;
  return <PageFrame eyebrow="Human Approval Workflow" title="Approval queue" description="Payments, deletions, exports, and record changes are routed to authorized reviewers with approve/reject capability and full audit capture.">
    <section className="console-card overflow-hidden">{approvalsQuery.data?.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Request</th><th>Status</th><th>Requested by</th><th>Expires</th><th>Decision</th></tr></thead><tbody>{approvalsQuery.data.map(item => <tr key={item.id}><td><p className="font-medium text-slate-100">Tool call #{item.toolCallId}</p><span>Full decision context is preserved in the audit ledger.</span></td><td><Badge tone={decisionTone(item.status)}>{pretty(item.status)}</Badge></td><td><code>{item.requestedBy}</code></td><td>{formatTime(item.expiresAt)}</td><td>{item.status === "pending" ? <div className="flex gap-2"><SecondaryButton disabled={decide.isPending} onClick={() => decide.mutate({ organizationId: organizationId!, approvalId: item.id, decision: "rejected", decisionReason: "Rejected by authorized reviewer." })}>Reject</SecondaryButton><PrimaryButton disabled={decide.isPending} onClick={() => decide.mutate({ organizationId: organizationId!, approvalId: item.id, decision: "approved", decisionReason: "Approved by authorized reviewer." })}>Approve</PrimaryButton></div> : <span className="text-slate-500">{item.decisionReason || "Decision recorded"}</span>}</td></tr>)}</tbody></table></div> : <EmptyState icon={Clock3} title="No pending approvals" detail="Actions matched to require approval policies will appear here before execution." />}</section>
  </PageFrame>;
}

export function AuditLedgerPage() {
  const { organizationId, ready } = useAgentFenceWorkspace();
  const audit = trpc.agentfence.audit.list.useQuery({ organizationId: organizationId ?? 0, limit: 80 }, { enabled: ready });
  const explain = trpc.agentfence.explanations.explainToolCall.useMutation();
  const suggest = trpc.agentfence.explanations.suggestPolicyImprovements.useMutation();
  const [explanation, setExplanation] = useState<string | null>(null);
  if (!ready) return <WorkspacePending />;
  return <PageFrame eyebrow="Tamper-Evident Audit Ledger" title="Auditable decision history" description="Immutable records of every agent decision, tool call, policy match, approval, and outcome, each with timestamps and actor identity.">
    <section className="console-card overflow-hidden"><div className="card-heading"><div><p className="card-kicker">Hash-chained records</p><h2>Ledger entries</h2></div><div className="flex gap-2 items-center"><SecondaryButton disabled={suggest.isPending} onClick={async () => { const result = await suggest.mutateAsync({ organizationId: organizationId! }); setExplanation(typeof result.suggestion === "string" ? result.suggestion : JSON.stringify(result.suggestion)); }}><Sparkles size={15} /> Analyze patterns</SecondaryButton><Badge tone="good">Sequence protected</Badge></div></div>{audit.data?.length ? <div className="ledger-list">{audit.data.map(entry => <article className="ledger-row" key={entry.id}><div className="ledger-sequence">#{entry.sequence}</div><div className="ledger-main"><div className="flex flex-wrap gap-2 items-center"><p>{pretty(entry.eventType)}</p><Badge tone={decisionTone(entry.outcome)}>{pretty(entry.outcome)}</Badge></div><span>{entry.actorType} · {entry.actorIdentity} · {formatTime(entry.createdAt)}</span><code className="hash-line">{entry.eventHash.slice(0, 22)}…</code></div>{entry.toolCallId ? <SecondaryButton disabled={explain.isPending} onClick={async () => { const result = await explain.mutateAsync({ organizationId: organizationId!, toolCallId: entry.toolCallId! }); setExplanation(typeof result.explanation === "string" ? result.explanation : JSON.stringify(result.explanation)); }}> <Sparkles size={15} /> Explain</SecondaryButton> : null}</article>)}</div> : <EmptyState icon={FileCheck2} title="No ledger entries yet" detail="The first protected action, policy change, approval, or export will create a hash-chained record." />}</section>{explanation && <section className="explanation-card"><div><p className="eyebrow">LLM-Powered Explanations and Suggestions</p><h2>Policy result explanation</h2></div><button className="icon-button" onClick={() => setExplanation(null)}><X size={18} /></button><p>{explanation}</p></section>}
  </PageFrame>;
}

export function DataGuardPage() {
  const { organizationId, ready } = useAgentFenceWorkspace();
  const findings = trpc.agentfence.dataGuard.list.useQuery({ organizationId: organizationId ?? 0 }, { enabled: ready });
  if (!ready) return <WorkspacePending />;
  return <PageFrame eyebrow="Data Guard" title="Sensitive data controls" description="PII, secrets, PHI, and payment data are detected and redacted in agent inputs and outputs before they reach unapproved models or destinations.">
    <section className="data-guard-hero"><LockKeyhole size={25} /><div><strong>Redact before the model boundary.</strong><p>AgentFence retains redacted parameters and classifier findings in the audit path; raw credentials and sensitive values are not written into the ledger.</p></div></section>
    <section className="console-card overflow-hidden">{findings.data?.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Classification</th><th>Detector</th><th>Action taken</th><th>Occurrences</th><th>Destination approved</th><th>Time</th></tr></thead><tbody>{findings.data.map(finding => <tr key={finding.id}><td><Badge tone={finding.classification === "secret" || finding.classification === "payment" ? "danger" : "warn"}>{pretty(finding.classification)}</Badge></td><td><code>{finding.detector}</code></td><td>{pretty(finding.actionTaken)}</td><td>{finding.occurrences}</td><td>{finding.destinationApproved ? <span className="text-emerald-300">Approved</span> : <span className="text-amber-300">Restricted</span>}</td><td>{formatTime(finding.createdAt)}</td></tr>)}</tbody></table></div> : <EmptyState icon={LockKeyhole} title="No sensitive-data findings" detail="Data Guard findings will appear when the Tool Gateway detects or redacts sensitive patterns." />}</section>
  </PageFrame>;
}

export function CredentialVaultPage() {
  const { organizationId, ready, teamId } = useWorkspaceData();
  const vault = trpc.agentfence.vault.list.useQuery({ organizationId: organizationId ?? 0 }, { enabled: ready });
  const create = trpc.agentfence.vault.createReference.useMutation({ onSuccess: () => { toast.success("Scoped credential reference registered"); vault.refetch(); } });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", provider: "", externalReference: "", allowedScopes: "read", tokenTtlSeconds: "300" });
  if (!ready) return <WorkspacePending />;
  const submit = (event: FormEvent) => { event.preventDefault(); create.mutate({ organizationId: organizationId!, teamId, name: form.name, provider: form.provider, externalReference: form.externalReference, allowedScopes: form.allowedScopes.split(",").map(scope => scope.trim()).filter(Boolean), tokenTtlSeconds: Number(form.tokenTtlSeconds) }); setOpen(false); };
  return <PageFrame eyebrow="Credential Vault" title="Scoped credential references" description="Secrets are stored and injected as scoped, short-lived tokens so agents never have access to raw API keys or OAuth credentials." action={<PrimaryButton onClick={() => setOpen(true)}><Plus size={16} /> Register reference</PrimaryButton>}>
    <section className="vault-notice"><KeyRound size={19} /><span>AgentFence stores provider references and scopes in this platform. Connect a managed secret store before using a vault reference for live issuance.</span></section>
    <section className="console-card overflow-hidden">{vault.data?.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Credential reference</th><th>Provider</th><th>Scoped access</th><th>Token lifetime</th><th>Status</th></tr></thead><tbody>{vault.data.map(item => <tr key={item.id}><td><p className="font-medium text-slate-100">{item.name}</p><span>Raw secret material is never displayed.</span></td><td>{item.provider}</td><td>{Array.isArray(item.allowedScopes) ? item.allowedScopes.join(", ") : "Scoped"}</td><td>{item.tokenTtlSeconds}s</td><td><Badge tone={item.status === "active" ? "good" : "neutral"}>{item.status}</Badge></td></tr>)}</tbody></table></div> : <EmptyState icon={KeyRound} title="No vault references" detail="Register a provider reference, limited scopes, and a short token lifetime before a workload can request credentials." />}</section>
    {open && <div className="modal-backdrop"><form onSubmit={submit} className="modal-panel"><div className="modal-head"><div><p className="eyebrow">Credential Vault</p><h2>Register credential reference</h2></div><button type="button" className="icon-button" onClick={() => setOpen(false)}><X size={18} /></button></div><div className="form-grid"><Field label="Reference name"><input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Payments API production" /></Field><Field label="Provider"><input required value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })} placeholder="Managed secret store" /></Field><Field label="External reference"><input required value={form.externalReference} onChange={e => setForm({ ...form, externalReference: e.target.value })} placeholder="secret://path/reference" /></Field><Field label="Allowed scopes"><input required value={form.allowedScopes} onChange={e => setForm({ ...form, allowedScopes: e.target.value })} placeholder="read, refund:create" /></Field><Field label="Short-lived token TTL (seconds)"><input required type="number" min="60" max="3600" value={form.tokenTtlSeconds} onChange={e => setForm({ ...form, tokenTtlSeconds: e.target.value })} /></Field></div><div className="modal-footer"><SecondaryButton type="button" onClick={() => setOpen(false)}>Cancel</SecondaryButton><PrimaryButton disabled={create.isPending}><KeyRound size={16} /> Register reference</PrimaryButton></div></form></div>}
  </PageFrame>;
}

export function SecurityTestsPage() {
  const { organizationId, ready } = useAgentFenceWorkspace();
  const agentsQuery = trpc.agentfence.agents.list.useQuery({ organizationId: organizationId ?? 0 }, { enabled: ready });
  const simulations = trpc.agentfence.simulations.list.useQuery({ organizationId: organizationId ?? 0 }, { enabled: ready });
  const run = trpc.agentfence.simulations.runSafeScenario.useMutation({ onSuccess: result => { toast.success(`Safe scenario ${pretty(result.status)}`); simulations.refetch(); } });
  const [agentId, setAgentId] = useState("");
  if (!ready) return <WorkspacePending />;
  return <PageFrame eyebrow="Attack Simulation" title="OWASP Agentic Top 10 assessment" description="Run controlled, non-destructive policy assessments against registered agents. These are not live attacks: AgentFence evaluates synthetic requests only and never executes a payload or contacts external infrastructure.">
    <section className="owasp-assessment-hero"><div className="owasp-spark spark-one" /><div className="owasp-spark spark-two" /><div><p className="eyebrow">Assessment boundary</p><h2>Test the control plane before an agent reaches production.</h2><p>Each ASI case becomes a regression test for identity, policy, Data Guard, approval, and audit controls. A result proves only the configured AgentFence decision—not security of an entire connected system.</p></div><div className="owasp-signal-panel"><span>10 assessment cases</span><strong>0 payload executions</strong><small>Synthetic requests · no external contact</small></div></section>
    <section className="console-card"><div className="test-toolbar"><div><p className="card-kicker">OWASP Agentic Top 10 · controlled assessment</p><h2>Evaluate guardrail coverage</h2></div><select value={agentId} onChange={e => setAgentId(e.target.value)}><option value="">Select registered agent</option>{agentsQuery.data?.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></div><div className="owasp-scenario-grid">{OWASP_AGENTIC_TOP10.map(scenario => <article className="owasp-scenario-card" key={scenario.id}><div className="owasp-card-top"><span>{scenario.asi}</span><i>Controlled</i></div><TriangleAlert size={18} /><h3>{scenario.title}</h3><p>{scenario.detail}</p><small>{scenario.expectedControl}</small><SecondaryButton disabled={!agentId || run.isPending} onClick={() => run.mutate({ organizationId: organizationId!, agentId: Number(agentId), scenarioType: scenario.id })}><Play size={15} /> Assess control</SecondaryButton></article>)}</div></section>
    <section className="console-card overflow-hidden"><div className="card-heading"><div><p className="card-kicker">Control coverage matrix</p><h2>Prevention, detection, approval, and audit</h2></div><Badge tone="info">Synthetic only</Badge></div><div className="data-table-wrap"><table className="data-table owasp-matrix"><thead><tr><th>Category</th><th>Prevention</th><th>Detection</th><th>Approval</th><th>Audit</th></tr></thead><tbody>{AGENTFENCE_OWASP_CONTROL_MATRIX.map(item => <tr key={item.id}><td><p className="font-medium text-slate-100">{item.asi} · {item.title}</p><span>{item.limitation}</span></td><td>{item.prevention}</td><td>{item.detection}</td><td>{item.approval}</td><td>{item.audit}</td></tr>)}</tbody></table></div></section>
    <section className="console-card"><div className="card-heading"><div><p className="card-kicker">Simulation evidence</p><h2>Recent test results</h2></div></div>{simulations.data?.length ? <div className="policy-stack">{simulations.data.map(test => <article className="policy-row" key={test.id}><div className={`policy-effect effect-${test.status === "passed" ? "allow" : test.status === "failed" ? "deny" : "require_approval"}`}><ShieldAlert size={17} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3>{test.scenarioName}</h3><Badge tone={decisionTone(test.status)}>{pretty(test.status)}</Badge></div><p>{test.actualOutcome}</p><span className="text-xs text-slate-500">{test.remediation}</span></div></article>)}</div> : <EmptyState icon={TriangleAlert} title="No simulations run" detail="Select an agent and run a safe scenario to create pre-deployment evidence." />}</section>
  </PageFrame>;
}

export function CompliancePage() {
  const { organizationId, ready } = useAgentFenceWorkspace();
  const exportsQuery = trpc.agentfence.evidence.list.useQuery({ organizationId: organizationId ?? 0 }, { enabled: ready });
  const exportMutation = trpc.agentfence.evidence.export.useMutation({ onSuccess: result => { toast.success("Compliance evidence packet generated"); exportsQuery.refetch(); window.open(result.url, "_blank", "noopener,noreferrer"); } });
  if (!ready) return <WorkspacePending />;
  const frameworks = ["SOC 2", "ISO 27001", "insurance review"] as const;
  return <PageFrame eyebrow="Compliance Evidence Export" title="Evidence packets" description="Store policy snapshots, tamper-evident audit reports, and durable evidence packets for SOC 2, ISO 27001, and insurance review use cases.">
    <section className="framework-grid">{frameworks.map(framework => <article className="framework-card" key={framework}><FileCheck2 size={20} /><p className="eyebrow">Evidence export</p><h2>{framework}</h2><p>Generate a durable JSON packet containing policy snapshots, agent inventory, approvals, and the current audit-ledger evidence.</p><PrimaryButton disabled={exportMutation.isPending} onClick={() => exportMutation.mutate({ organizationId: organizationId!, framework })}>{exportMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <FileCheck2 size={16} />} Export packet</PrimaryButton></article>)}</section>
    <section className="console-card overflow-hidden">{exportsQuery.data?.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Framework</th><th>Evidence hash</th><th>Generated</th><th>Durable file</th></tr></thead><tbody>{exportsQuery.data.map(packet => <tr key={packet.id}><td><Badge tone="info">{packet.framework}</Badge></td><td><code>{packet.evidenceHash.slice(0, 24)}…</code></td><td>{formatTime(packet.createdAt)}</td><td><a className="inline-link" href={packet.storageUrl} target="_blank" rel="noreferrer">Open evidence <ChevronRight size={14} /></a></td></tr>)}</tbody></table></div> : <EmptyState icon={FileCheck2} title="No evidence packets yet" detail="Generate an export when you need a durable review artifact for SOC 2, ISO 27001, or insurance review." />}</section>
  </PageFrame>;
}

export function VaultSettingsPage() {
  const { organizationId, ready } = useAgentFenceWorkspace();
  const status = trpc.agentfence.vault.status.useQuery({ organizationId: organizationId ?? 0 }, { enabled: ready });
  const agents = trpc.agentfence.agents.list.useQuery({ organizationId: organizationId ?? 0 }, { enabled: ready });
  const runtimeCredentials = trpc.agentfence.runtime.list.useQuery({ organizationId: organizationId ?? 0 }, { enabled: ready });
  const vaultReferences = trpc.agentfence.vault.list.useQuery({ organizationId: organizationId ?? 0 }, { enabled: ready });
  const probeVault = trpc.agentfence.vault.probe.useMutation();
  const issueVaultLease = trpc.agentfence.vault.issueLease.useMutation();
  const issueCredential = trpc.agentfence.runtime.issueCredential.useMutation();
  const revokeCredential = trpc.agentfence.runtime.revokeCredential.useMutation();
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [selectedVaultReferenceId, setSelectedVaultReferenceId] = useState<number | null>(null);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  if (!ready) return <WorkspacePending />;
  const vaultStatus = status.data;
  const configuration = [
    { key: "VAULT_ADDR", label: "Vault endpoint", detail: "HTTPS address of the dedicated Vault deployment.", configured: vaultStatus?.endpointConfigured ?? false },
    { key: "VAULT_ROLE_ID", label: "AppRole RoleID", detail: "Control-plane identity scoped only to the required AgentFence paths.", configured: vaultStatus?.roleIdConfigured ?? false },
    { key: "VAULT_SECRET_ID", label: "AppRole SecretID", detail: "Short-lived AppRole authentication material; rotate it under Vault policy.", configured: vaultStatus?.secretIdConfigured ?? false },
  ];
  const connected = vaultStatus?.connected ?? false;
  return <PageFrame eyebrow="Settings" title="Vault AppRole configuration" description="Configure a dedicated Vault deployment when you are ready. AgentFence checks configuration server-side and never returns or persists secret values." action={<div className="flex items-center gap-2"><SecondaryButton disabled={probeVault.isPending} onClick={async () => { try { const result = await probeVault.mutateAsync({ organizationId: organizationId! }); toast[result.reachable ? "success" : "message"](result.reachable ? "Vault health endpoint is reachable." : result.detail === "not_configured" ? "Vault configuration is not ready yet." : "Vault health endpoint is unavailable."); } catch (error) { toast.error(error instanceof Error ? error.message : "Vault readiness check failed."); } }}><Settings2 size={15} /> Check readiness</SecondaryButton><Badge tone={connected ? "good" : "warn"}>{connected ? "Vault configured" : "Vault disconnected"}</Badge></div>}>
    <section className="vault-notice"><CircleAlert size={19} /><span><strong>{connected ? "Configuration detected." : "Disconnected by design."}</strong> {connected ? "All required AppRole configuration values are present. Secret values remain unavailable to the console and agents." : "One or more required Vault values are not configured. Credential references remain metadata only; no live lease can be issued."}</span></section>
    <section className="framework-grid">{configuration.map(item => <article className="framework-card" key={item.key}><Settings2 size={20} /><p className="eyebrow">Environment secret</p><h2>{item.label}</h2><p>{item.detail}</p><code className="font-mono text-cyan-200 text-xs">{item.key}</code><div className="mt-auto pt-5"><Badge tone={item.configured ? "good" : "neutral"}>{item.configured ? "Configured" : "Not configured"}</Badge></div></article>)}</section>
    <section className="console-card"><div className="card-heading"><div><p className="card-kicker">Dedicated Vault deployment</p><h2>Secure configuration checklist</h2></div><Badge tone="info">AppRole</Badge></div><div className="pt-5 grid gap-4 text-sm text-slate-400 leading-7"><p>Configure <code className="font-mono text-cyan-200">VAULT_ADDR</code>, <code className="font-mono text-cyan-200">VAULT_ROLE_ID</code>, and <code className="font-mono text-cyan-200">VAULT_SECRET_ID</code> in the secure deployment-secret settings when the Vault environment is available. AgentFence will only read these values server-side.</p><p>Use a dedicated AppRole with tenant-scoped policies, short lease TTLs, response wrapping where appropriate, and revocation enabled. Do not paste raw Vault tokens or secret values into the application, audit records, policy fields, or agent prompts.</p><p>Once configured, AgentFence will authenticate the control plane against Vault to issue scoped credential leases. Agents receive only short-lived, policy-bound lease material; raw provider secrets remain inside Vault.</p></div></section>
    <section className="console-card"><div className="card-heading"><div><p className="card-kicker">Signed runtime gateway</p><h2>Short-lived agent credentials</h2></div><Badge tone="info">Replay protected</Badge></div><div className="mt-5 grid gap-4"><div className="grid grid-cols-1 md:grid-cols-3 gap-3"><select value={selectedAgentId ?? agents.data?.[0]?.id ?? ""} onChange={event => setSelectedAgentId(Number(event.target.value))} disabled={!agents.data?.length}><option value="">Select an agent</option>{agents.data?.map(agent => <option key={agent.id} value={agent.id}>{agent.name} · {agent.identity}</option>)}</select><select value={selectedVaultReferenceId ?? vaultReferences.data?.[0]?.id ?? ""} onChange={event => setSelectedVaultReferenceId(Number(event.target.value))} disabled={!vaultReferences.data?.length}><option value="">Select a credential reference</option>{vaultReferences.data?.map(reference => <option key={reference.id} value={reference.id}>{reference.name} · {reference.tokenTtlSeconds}s</option>)}</select><PrimaryButton disabled={issueCredential.isPending || !(selectedAgentId ?? agents.data?.[0]?.id) || !(selectedVaultReferenceId ?? vaultReferences.data?.[0]?.id)} onClick={async () => { const agentId = selectedAgentId ?? agents.data?.[0]?.id; const vaultCredentialId = selectedVaultReferenceId ?? vaultReferences.data?.[0]?.id; const reference = vaultReferences.data?.find(item => item.id === vaultCredentialId); if (!agentId || !vaultCredentialId || !reference) return; try { const issued = await issueCredential.mutateAsync({ organizationId: organizationId!, agentId, vaultCredentialId, requestedScopes: Array.isArray(reference.allowedScopes) ? reference.allowedScopes.filter((scope): scope is string => typeof scope === "string") : [], ttlSeconds: Math.min(300, reference.tokenTtlSeconds) }); setIssuedToken(issued.token); await runtimeCredentials.refetch(); toast.success("Scoped runtime credential issued. Copy it now; it will not be displayed again."); } catch (error) { toast.error(error instanceof Error ? error.message : "Credential issuance failed."); } }}><KeyRound size={16} /> Issue scoped credential</PrimaryButton></div><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-500/15 bg-cyan-500/[0.03] px-4 py-3"><p className="text-xs text-slate-400">Live dynamic leases remain server-side. AgentFence records lease metadata and never displays the lease ID or the secret value.</p><SecondaryButton disabled={!connected || issueVaultLease.isPending || !(selectedAgentId ?? agents.data?.[0]?.id) || !(selectedVaultReferenceId ?? vaultReferences.data?.[0]?.id)} onClick={async () => { const agentId = selectedAgentId ?? agents.data?.[0]?.id; const vaultCredentialId = selectedVaultReferenceId ?? vaultReferences.data?.[0]?.id; if (!agentId || !vaultCredentialId) return; try { const lease = await issueVaultLease.mutateAsync({ organizationId: organizationId!, agentId, vaultCredentialId }); toast.success(`Vault lease issued for ${lease.leaseDurationSeconds}s.`); } catch (error) { toast.error(error instanceof Error ? error.message : "Vault lease request failed."); } }}><KeyRound size={15} /> Request live lease</SecondaryButton></div><p className="text-xs text-slate-500 leading-5">Each credential is bound to one agent and one Vault credential reference. Its scopes and lifetime cannot exceed the selected reference; every request requires a single-use nonce.</p>{issuedToken ? <div className="explanation-card"><div className="flex items-center justify-between gap-3"><div><p className="eyebrow">Display once</p><h2>Copy the runtime credential now</h2></div><button className="icon-button" onClick={() => setIssuedToken(null)}><X size={18} /></button></div><code className="block mt-4 text-cyan-100 text-xs break-all leading-6">{issuedToken}</code><div className="mt-4"><SecondaryButton onClick={async () => { await navigator.clipboard.writeText(issuedToken); toast.success("Runtime credential copied."); }}><Check size={15} /> Copy credential</SecondaryButton></div></div> : null}<div className="data-table-wrap"><table className="data-table"><thead><tr><th>Agent</th><th>Reference scopes</th><th>Credential state</th><th>Expires</th><th>Control</th></tr></thead><tbody>{runtimeCredentials.data?.length ? runtimeCredentials.data.map(item => <tr key={item.id}><td><p>{item.agentName}</p><span>{item.agentIdentity}</span></td><td>{Array.isArray(item.allowedScopes) ? item.allowedScopes.join(", ") : "Scoped"}</td><td><Badge tone={item.status === "active" ? "good" : item.status === "revoked" ? "danger" : "neutral"}>{item.status}</Badge></td><td>{formatTime(item.expiresAt)}</td><td>{item.status === "active" ? <SecondaryButton disabled={revokeCredential.isPending} onClick={async () => { try { await revokeCredential.mutateAsync({ organizationId: organizationId!, credentialId: item.id }); await runtimeCredentials.refetch(); toast.success("Runtime credential revoked."); } catch (error) { toast.error(error instanceof Error ? error.message : "Credential revocation failed."); } }}>Revoke</SecondaryButton> : <span className="text-slate-500">No action</span>}</td></tr>) : <tr><td colSpan={5} className="text-center text-slate-500">Register a Vault credential reference before issuing runtime credentials.</td></tr>}</tbody></table></div></div></section>
  </PageFrame>;
}
