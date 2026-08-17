import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const navigate = vi.fn();
const refresh = vi.fn();
const logout = vi.fn();
const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 7, name: "Sunny Thakur", email: "sunny@example.com", avatarUrl: null, loginMethod: "Google OAuth" }, refresh, logout }),
}));
vi.mock("wouter", () => ({ useLocation: () => ["/security", navigate] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    account: {
      profile: { useQuery: () => ({ data: { id: 7, name: "Sunny Thakur", email: "sunny@example.com", avatarUrl: null, loginMethod: "Google OAuth" }, refetch: vi.fn() }) },
      updateProfile: { useMutation: () => mutation() },
      uploadAvatar: { useMutation: () => mutation() },
      passwordProvider: { useQuery: () => ({ data: { loginMethod: "Google OAuth", managedExternally: true, managementUrl: "/signin" } }) },
      startPasswordChange: { useMutation: () => mutation() },
      sessions: {
        list: { useQuery: () => ({ data: [{ id: 1, current: true, deviceInfo: "Chrome on Linux", ipAddress: "10.10.•••", lastActiveAt: new Date(), createdAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000) }], refetch: vi.fn() }) },
        revoke: { useMutation: () => mutation() },
        revokeOthers: { useMutation: () => mutation() },
      },
      deleteAccount: { useMutation: () => mutation() },
    },
  },
}));

import { DELETE_ACCOUNT_CONFIRMATION, DeleteAccountConfirmationModal, ProfileAccountPage, SecurityConnectionsPage } from "./Account";

describe("rendered account-security pages", () => {
  it("renders the profile page with identity, avatar upload, and profile controls", () => {
    const markup = renderToStaticMarkup(<ProfileAccountPage />);
    expect(markup).toContain("Profile &amp; account");
    expect(markup).toContain("Upload avatar");
    expect(markup).toContain("Display name");
    expect(markup).toContain("Save profile");
  });

  it("renders the real Delete Account modal with a safe pre-confirmation state", () => {
    const markup = renderToStaticMarkup(<DeleteAccountConfirmationModal open confirmation="" pending={false} onClose={() => undefined} onConfirmationChange={() => undefined} onConfirm={() => undefined} />);
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain("Delete your AgentFence account?");
    expect(markup).toContain(DELETE_ACCOUNT_CONFIRMATION);
    expect(markup).toContain('disabled=""');
    expect(markup).toContain("Cancel");
  });

  it("renders security controls with provider-managed password copy, current session, and deletion boundary", () => {
    const markup = renderToStaticMarkup(<SecurityConnectionsPage />);
    expect(markup).toContain("Password management");
    expect(markup).toContain("Provider-managed");
    expect(markup).toContain("Where you are signed in");
    expect(markup).toContain("This device");
    expect(markup).toContain("Delete Account");
    expect(markup).toContain("Shared workspaces must be transferred");
  });
});
