import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ENTERPRISE_PILOT_TOUR_STEPS, EnterprisePilotTour, enterprisePilotTourRecord, nextEnterprisePilotTourStep, normalizeEnterprisePilotTourState } from "./EnterprisePilotTour";

describe("EnterprisePilotTour", () => {
  it("defines a bounded five-stage route through ownership, agents, policy, connectors, and coverage", () => {
    expect(ENTERPRISE_PILOT_TOUR_STEPS.map(step => step.destination)).toEqual(["/team", "/integrations", "/policy-governance", "/secure-connectors", "/coverage"]);
    expect(nextEnterprisePilotTourStep(0)).toBe(1);
    expect(nextEnterprisePilotTourStep(99)).toBe(ENTERPRISE_PILOT_TOUR_STEPS.length - 1);
  });

  it("normalizes resumable state and serializes a completed dismissal record without exposing operational data", () => {
    expect(normalizeEnterprisePilotTourState({ step: -4, completed: false })).toEqual({ step: 0, completed: false });
    expect(normalizeEnterprisePilotTourState({ step: 999, completed: true })).toEqual({ step: 4, completed: true });
    expect(enterprisePilotTourRecord(4, true)).toBe('{"step":4,"completed":true}');
  });

  it("renders the first guided step, safe boundary note, and next destination action when opened", () => {
    const markup = renderToStaticMarkup(<EnterprisePilotTour open onClose={() => undefined} onNavigate={() => undefined} />);
    expect(markup).toContain("Assign accountable owners");
    expect(markup).toContain("Open team management");
    expect(markup).toContain("does not mark a setup task complete");
  });
});
