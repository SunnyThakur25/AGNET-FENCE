import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { AuthPanel, LandingPage } from "./Public";

function textContent(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textContent(node.props.children);
  return "";
}

function authButtons(node: React.ReactNode): Array<React.ReactElement<{ onClick?: () => void; children?: React.ReactNode }>> {
  if (!React.isValidElement<{ children?: React.ReactNode; onClick?: () => void }>(node)) return [];
  const descendants = React.Children.toArray(node.props.children).flatMap(authButtons);
  return node.type === "button" ? [node, ...descendants] : descendants;
}

describe("AgentFence public authentication journey", () => {
  it("renders a secure Google entry and an SSO entry without collecting a password", () => {
    const markup = renderToStaticMarkup(<Router ssrPath="/"><AuthPanel mode="signin" onAuthenticate={() => undefined} /></Router>);
    expect(markup).toContain("Continue with Google");
    expect(markup).toContain("Continue with secure SSO");
    expect(markup).not.toContain("type=\"password\"");
  });

  it("frames first login as creating a protected security workspace", () => {
    const markup = renderToStaticMarkup(<Router ssrPath="/"><AuthPanel mode="signup" onAuthenticate={() => undefined} /></Router>);
    expect(markup).toContain("Create your security workspace");
    expect(markup).toContain("isolated organization");
  });

  it("renders the containment-led AI-agent firewall landing story and workspace conversion path", () => {
    const markup = renderToStaticMarkup(<Router ssrPath="/"><LandingPage /></Router>);
    expect(markup).toContain("The red line between");
    expect(markup).toContain("agents and consequences.");
    expect(markup).toContain("AI agent containment layer");
    expect(markup).toContain("Build your control plane");
    expect(markup).toContain("Human gate");
  });

  it("renders the enterprise architecture visual and guided cloud/browser control narrative", () => {
    const markup = renderToStaticMarkup(<Router ssrPath="/"><LandingPage /></Router>);
    expect(markup).toContain("Enterprise architecture");
    expect(markup).toContain("One integrated control path across cloud, browser, and enterprise systems.");
    expect(markup).toContain("agentfence_claim_hardened_architecture_946b4c2e.png");
    expect(markup).toContain("Connect a workload");
    expect(markup).toContain("Control each integrated action");
    expect(markup).toContain("Prove what happened");
  });

  it("renders feature-based Pilot, Growth, and Enterprise pricing without an unsupported ROI promise", () => {
    const markup = renderToStaticMarkup(<Router ssrPath="/"><LandingPage /></Router>);
    expect(markup).toContain("Feature-based plans");
    expect(markup).toContain("$99");
    expect(markup).toContain("$299");
    expect(markup).toContain("Custom");
    expect(markup).toContain("It does not promise a particular ROI");
  });

  it("routes all sign-in, sign-up, Google, and SSO entry controls to the secure OAuth handler", () => {
    let calls = 0;
    for (const mode of ["signin", "signup"] as const) {
      const buttons = authButtons(AuthPanel({ mode, onAuthenticate: () => { calls += 1; } }));
      const labels = buttons.map(button => textContent(button.props.children)).join(" ");
      expect(labels).toContain("Continue with Google");
      expect(labels).toContain("Continue with secure SSO");
      buttons.forEach(button => button.props.onClick?.());
    }
    expect(calls).toBe(4);
  });
});
