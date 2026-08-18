import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SidebarCollapseToggle, ThemeToggle } from "./DashboardLayout";

describe("ThemeToggle", () => {
  it("marks dark mode pressed and offers a light-mode switch", () => {
    const markup = renderToStaticMarkup(<ThemeToggle theme="dark" toggleTheme={() => undefined} />);
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-label="Switch to light mode"');
    expect(markup).toContain("Dark mode");
  });

  it("invokes the theme switch callback when the rendered toggle is activated", () => {
    let activations = 0;
    const element = ThemeToggle({ theme: "dark", toggleTheme: () => { activations += 1; } }) as React.ReactElement<{ onClick: () => void }>;
    element.props.onClick();
    expect(activations).toBe(1);
  });

  it("marks light mode unpressed and offers a dark-mode switch", () => {
    const markup = renderToStaticMarkup(<ThemeToggle theme="light" toggleTheme={() => undefined} />);
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('aria-label="Switch to dark mode"');
    expect(markup).toContain("Light mode");
  });
});

describe("SidebarCollapseToggle", () => {
  it("exposes an accessible collapse action when the sidebar is expanded", () => {
    const markup = renderToStaticMarkup(<SidebarCollapseToggle collapsed={false} onToggle={() => undefined} />);
    expect(markup).toContain('aria-label="Collapse sidebar"');
    expect(markup).toContain('aria-pressed="false"');
  });

  it("exposes an accessible expand action and calls the supplied toggle handler when collapsed", () => {
    let activations = 0;
    const element = SidebarCollapseToggle({ collapsed: true, onToggle: () => { activations += 1; } }) as React.ReactElement<{ onClick: () => void }>;
    expect(renderToStaticMarkup(element)).toContain('aria-label="Expand sidebar"');
    expect(renderToStaticMarkup(element)).toContain('aria-pressed="true"');
    element.props.onClick();
    expect(activations).toBe(1);
  });

  it("keeps the collapsed control and brand copy inside the sidebar rail", () => {
    const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
    expect(css).toContain(".sidebar-collapsed .agentfence-logo-copy");
    expect(css).toContain(".sidebar-collapsed .sidebar-collapse-toggle{position:static");
    expect(css).toContain(".sidebar-collapsed .app-sidebar{flex-basis:76px");
    expect(css).not.toContain(".sidebar-collapsed .sidebar-collapse-toggle{position:absolute;left:51px");
  });

  it("keeps compact navigation deliberate and motion-safe", () => {
    const layout = readFileSync(resolve(process.cwd(), "client/src/components/DashboardLayout.tsx"), "utf8");
    const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
    expect(layout).toContain("More governance & evidence");
    expect(layout).toContain("delayDuration={650}");
    expect(layout).toContain('aria-controls="supplementary-navigation"');
    expect(css).toContain(".sidebar-nav-group.open .supplementary-navigation");
    expect(css).toContain("@media (prefers-reduced-motion:reduce)");
  });

  it("provides a searchable command palette across primary and supplementary routes", () => {
    const layout = readFileSync(resolve(process.cwd(), "client/src/components/DashboardLayout.tsx"), "utf8");
    expect(layout).toContain("CommandDialog");
    expect(layout).toContain("Search workspaces, controls, or evidence");
    expect(layout).toContain("event.key.toLowerCase() === \"k\"");
    expect(layout).toContain("Core operations");
    expect(layout).toContain("Governance and evidence");
  });
});
