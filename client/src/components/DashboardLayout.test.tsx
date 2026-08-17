import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeToggle } from "./DashboardLayout";

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
