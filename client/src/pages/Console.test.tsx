import React from "react";
import { describe, expect, it } from "vitest";
import { ActionCaptureControls, ActionCaptureRows, ActionTraceHopCard, ActionSummaryWidget, canAdvanceFirstAgentOnboarding, captureOutcome, filterAndSortCapturedActions, FIRST_AGENT_ONBOARDING_STEPS, isTraceLive, TraceHopTooltip } from "./Console";
import { renderToStaticMarkup } from "react-dom/server";

const actions = [
  { toolName: "crm", action: "case.update", agentName: "Support", agentIdentity: "support.prod", destination: "crm.internal", policyName: "Scoped CRM", decision: "allowed", targetOutcome: "succeeded", createdAt: "2026-01-01T00:02:00.000Z", targetRecordedAt: "2026-01-01T00:02:03.000Z" },
  { toolName: "billing", action: "refund.create", agentName: "Finance", agentIdentity: "finance.prod", destination: "billing.internal", policyName: "Refund approval", decision: "approval_required", targetOutcome: null, createdAt: "2026-01-01T00:01:00.000Z", targetRecordedAt: null },
  { toolName: "crm", action: "customer.export", agentName: "Support", agentIdentity: "support.prod", destination: "crm.internal", policyName: null, decision: "blocked", targetOutcome: null, createdAt: "2026-01-01T00:03:00.000Z", targetRecordedAt: null },
];
const rowFixtures = actions.map((item, index) => ({ ...item, id: index + 1, createdAt: new Date(item.createdAt), targetRecordedAt: item.targetRecordedAt ? new Date(item.targetRecordedAt) : null, targetStatusCode: null, riskLevel: "medium", dataSensitivity: "internal", dataGuardFindings: [], approval: null }));

describe("AI Action Capture and Trace helpers", () => {
  it("requires a real runtime choice, valid workload identity, and a narrow first boundary before onboarding advances", () => {
    const base = { runtime: "", name: "", identity: "", tool: "", action: "", destination: "" };
    expect(FIRST_AGENT_ONBOARDING_STEPS).toEqual(["Choose runtime", "Register identity", "Set first boundary", "Wrap a real action"]);
    expect(canAdvanceFirstAgentOnboarding(0, base)).toBe(false);
    expect(canAdvanceFirstAgentOnboarding(0, { ...base, runtime: "cloud" })).toBe(true);
    expect(canAdvanceFirstAgentOnboarding(1, { ...base, runtime: "cloud", name: "Support agent", identity: "agent.support.prod" })).toBe(true);
    expect(canAdvanceFirstAgentOnboarding(1, { ...base, runtime: "browser", name: "Support agent", identity: "unsafe identity" })).toBe(false);
    expect(canAdvanceFirstAgentOnboarding(2, { ...base, runtime: "browser", name: "Support agent", identity: "agent.browser.prod", tool: "crm", action: "case.update", destination: "crm.company.internal" })).toBe(true);
  });
  it("renders the customizable 24-hour action summary widget controls", () => {
    const markup = renderToStaticMarkup(<ActionSummaryWidget totalActions={12} windowStart="2026-01-01T00:00:00.000Z" items={[{ key: "crm.case.update", toolName: "crm", action: "case.update", count: 7, completed: 6, succeeded: 5, failed: 1, pending: 1, successRate: 83 }]} />);
    expect(markup).toContain("last 24 hours");
    expect(markup).toContain("Most frequent agent actions");
    expect(markup).toContain('aria-label="Sort action summary"');
    expect(markup).toContain('aria-label="Visible action rows"');
    expect(markup).toContain('aria-label="Collapse action summary"');
    expect(markup).toContain("83% success");
  });

  it("uses the downstream target outcome when it is available and falls back while pending", () => {
    expect(captureOutcome({ decision: "allowed", targetOutcome: "succeeded" })).toBe("succeeded");
    expect(captureOutcome({ decision: "approval_required", targetOutcome: null })).toBe("approval_required");
  });

  it("searches across intent, policy, agent, destination, and outcome", () => {
    expect(filterAndSortCapturedActions(actions, "refund approval", "all", "newest").map(item => item.action)).toEqual(["refund.create"]);
    expect(filterAndSortCapturedActions(actions, "succeeded", "all", "newest").map(item => item.action)).toEqual(["case.update"]);
  });

  it("filters decisions and supports newest, oldest, intent, policy, and outcome sorting", () => {
    expect(filterAndSortCapturedActions(actions, "", "blocked", "newest").map(item => item.action)).toEqual(["customer.export"]);
    expect(filterAndSortCapturedActions(actions, "", "all", "oldest").map(item => item.action)).toEqual(["refund.create", "case.update", "customer.export"]);
    expect(filterAndSortCapturedActions(actions, "", "all", "intent").map(item => item.action)).toEqual(["refund.create", "case.update", "customer.export"]);
    expect(filterAndSortCapturedActions(actions, "", "all", "policy").map(item => item.action)).toEqual(["customer.export", "refund.create", "case.update"]);
    expect(filterAndSortCapturedActions(actions, "", "all", "outcome").map(item => item.action)).toEqual(["refund.create", "customer.export", "case.update"]);
  });

  it("marks allowed actions without a target report as live and preserves fetching state", () => {
    expect(isTraceLive({ decision: "allowed", targetOutcome: null }, false)).toBe(true);
    expect(isTraceLive({ decision: "blocked", targetOutcome: null }, false)).toBe(false);
    expect(isTraceLive({ decision: "blocked", targetOutcome: null }, true)).toBe(true);
  });

  it("renders Action Capture controls with searchable/filterable/sortable affordances", () => {
    const markup = renderToStaticMarkup(<ActionCaptureControls search="crm" decisionFilter="all" sort="newest" visibleCount={2} onSearch={() => undefined} onDecisionFilter={() => undefined} onSort={() => undefined} />);
    expect(markup).toContain('aria-label="Search captured actions"');
    expect(markup).toContain('aria-label="Filter capture outcome"');
    expect(markup).toContain('aria-label="Sort captured actions"');
    expect(markup).toContain("Target succeeded");
    expect(markup).toContain("Policy");
  });

  it("renders visible Action Capture rows in the filtered and sorted result order", () => {
    const visible = filterAndSortCapturedActions(rowFixtures, "crm", "all", "oldest");
    const markup = renderToStaticMarkup(<ActionCaptureRows actions={visible} onTrace={() => undefined} />);
    expect(markup).toContain('data-testid="capture-row-1"');
    expect(markup).toContain('data-testid="capture-row-3"');
    expect(markup).not.toContain('data-testid="capture-row-2"');
    expect(markup.indexOf("case.update")).toBeLessThan(markup.indexOf("customer.export"));
  });

  it("renders visible row changes for decision and downstream outcome filters", () => {
    const blockedMarkup = renderToStaticMarkup(<ActionCaptureRows actions={filterAndSortCapturedActions(rowFixtures, "", "blocked", "newest")} onTrace={() => undefined} />);
    const succeededMarkup = renderToStaticMarkup(<ActionCaptureRows actions={filterAndSortCapturedActions(rowFixtures, "", "succeeded", "newest")} onTrace={() => undefined} />);
    expect(blockedMarkup).toContain('data-testid="capture-row-3"');
    expect(blockedMarkup).not.toContain('data-testid="capture-row-1"');
    expect(succeededMarkup).toContain('data-testid="capture-row-1"');
    expect(succeededMarkup).not.toContain('data-testid="capture-row-2"');
  });

  it("renders visible row order for every supported sort mode", () => {
    const expected: Record<string, string[]> = {
      newest: ["capture-row-3", "capture-row-1", "capture-row-2"],
      oldest: ["capture-row-2", "capture-row-1", "capture-row-3"],
      agent: ["capture-row-2", "capture-row-1", "capture-row-3"],
      intent: ["capture-row-2", "capture-row-1", "capture-row-3"],
      policy: ["capture-row-3", "capture-row-2", "capture-row-1"],
      outcome: ["capture-row-2", "capture-row-3", "capture-row-1"],
    };
    for (const [sort, order] of Object.entries(expected)) {
      const markup = renderToStaticMarkup(<ActionCaptureRows actions={filterAndSortCapturedActions(rowFixtures, "", "all", sort as "newest" | "oldest" | "agent" | "intent" | "policy" | "outcome")} onTrace={() => undefined} />);
      expect(order.map(id => markup.indexOf(id)).every((position, index, positions) => index === 0 || position > positions[index - 1])).toBe(true);
    }
  });

  it("renders a hop card with in-context tooltip linkage and live pending indicator", () => {
    const markup = renderToStaticMarkup(<ActionTraceHopCard hop={{ id: "target-boundary", label: "Target boundary released", status: "allowed", detail: "Awaiting wrapped integration report.", timestamp: "2026-01-01T00:00:00.000Z" }} index={0} total={1} live intent="crm.case.update" policy="Scoped CRM" decision="Allowed" dataGuard="No findings" targetOutcome="Awaiting wrapped integration report" />);
    expect(markup).toContain('aria-describedby="trace-tooltip-target-boundary"');
    expect(markup).toContain('id="trace-tooltip-target-boundary"');
    expect(markup).toContain("Updating");
    expect(markup).toContain("crm.case.update");
  });

  it("renders an accessible tooltip with policy, intent, Data Guard, and target outcome details", () => {
    const markup = renderToStaticMarkup(<TraceHopTooltip id="hop-policy" intent="crm.case.update" policy="Scoped CRM" decision="Allowed" dataGuard="No findings" targetOutcome="Awaiting wrapped integration report" />);
    expect(markup).toContain('role="tooltip"');
    expect(markup).toContain('id="hop-policy"');
    expect(markup).toContain("crm.case.update");
    expect(markup).toContain("Scoped CRM");
    expect(markup).toContain("Awaiting wrapped integration report");
  });
});
