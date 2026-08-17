import React from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { SignInPage } from "@/pages/Public";
import { Activity, BellRing, Building2, ChevronDown, ClipboardCheck, CreditCard, FileCheck2, GitBranch, KeyRound, LayoutDashboard, LockKeyhole, LogOut, Moon, Radar, ScanLine, Settings2, ShieldAlert, ShieldCheck, Sun, TerminalSquare, UserRound, UsersRound } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { AgentFenceLogo } from "./AgentFenceLogo";
import { useTheme } from "@/contexts/ThemeContext";

export function ThemeToggle({ theme, toggleTheme }: { theme: "light" | "dark"; toggleTheme: () => void }) {
  return <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} aria-pressed={theme === "dark"}>{theme === "dark" ? <span>Dark mode</span> : <span>Light mode</span>}{theme === "dark" ? <span className="theme-toggle-track"><span className="theme-toggle-thumb"><Moon size={12} /></span></span> : <span className="theme-toggle-track"><span className="theme-toggle-thumb theme-toggle-thumb-light"><Sun size={12} /></span></span>}</button>;
}

const navigation = [
  { label: "Command center", path: "/", icon: LayoutDashboard },
  { label: "Agent Registry", path: "/agents", icon: Radar },
  { label: "Policy Engine", path: "/policies", icon: ShieldCheck },
  { label: "Tool Gateway", path: "/gateway", icon: TerminalSquare },
  { label: "Integrations", path: "/integrations", icon: TerminalSquare },
  { label: "Enterprise pilot", path: "/enterprise", icon: Building2 },
  { label: "Team management", path: "/team", icon: UsersRound },
  { label: "Billing & plans", path: "/billing", icon: CreditCard },
  { label: "Action Capture", path: "/action-capture", icon: ScanLine },
  { label: "Action Trace", path: "/action-trace", icon: GitBranch },
  { label: "Approvals", path: "/approvals", icon: ClipboardCheck },
  { label: "Audit Ledger", path: "/audit", icon: Activity },
  { label: "Data Guard", path: "/data-guard", icon: LockKeyhole },
  { label: "Credential Vault", path: "/vault", icon: KeyRound },
  { label: "Attack Simulation", path: "/tests", icon: ShieldAlert },
  { label: "Compliance Evidence", path: "/compliance", icon: FileCheck2 },
  { label: "Settings", path: "/settings", icon: Settings2 },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user, logout } = useAuth();
  const [location, navigate] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  if (loading) return <div className="shell-loading"><ShieldCheck className="animate-pulse" /> Loading AgentFence…</div>;
  if (!user) return <SignInPage />;
  return <div className="app-shell"><aside className="app-sidebar"><div className="sidebar-top"><AgentFenceLogo /><div className="workspace-switcher"><span className="workspace-dot" /> <span>Security workspace</span><ChevronDown size={13} /></div></div><nav className="sidebar-nav">{navigation.map(item => { const active = item.path === "/" ? location === "/" : location.startsWith(item.path); return <button key={item.path} onClick={() => navigate(item.path)} className={`nav-item ${active ? "active" : ""}`}><item.icon size={17} /><span>{item.label}</span>{active && <span className="nav-active-dot" />}</button>; })}</nav><div className="sidebar-bottom"><div className="sidebar-utility"><BellRing size={16} /><span>Notifications active</span><span className="utility-dot" /></div><div className="profile-bar-wrap"><button type="button" className="user-block" aria-expanded={profileOpen} aria-controls="profile-bar-menu" onClick={() => setProfileOpen(open => !open)}><div className="user-avatar">{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.name?.slice(0, 1).toUpperCase() || "A"}</div><div className="min-w-0 flex-1 text-left"><p>{user.name || "AgentFence operator"}</p><span>{user.email || "Authenticated user"}</span></div><ChevronDown size={15} className={profileOpen ? "profile-chevron open" : "profile-chevron"} /></button>{profileOpen && <div id="profile-bar-menu" className="profile-bar-menu" role="menu"><button type="button" role="menuitem" onClick={() => { setProfileOpen(false); navigate("/profile"); }}><UserRound size={15} /><span><strong>Profile & account</strong><small>Personal details and avatar</small></span></button><button type="button" role="menuitem" onClick={() => { setProfileOpen(false); navigate("/security"); }}><LockKeyhole size={15} /><span><strong>Security & connections</strong><small>Password, sessions, deletion</small></span></button><button type="button" role="menuitem" className="profile-signout" onClick={async () => { setProfileOpen(false); await logout(); }}><LogOut size={15} /><span><strong>Sign out</strong><small>End this authenticated session</small></span></button></div>}</div></div></aside><main className="app-main"><div className="top-status"><div className="environment-pill"><span /> Production controls ready</div><div className="top-status-actions"><div className="top-status-meta">Multi-tenant · Audit chained · Data Guard enabled</div>{toggleTheme && <ThemeToggle theme={theme} toggleTheme={toggleTheme} />}</div></div>{children}</main></div>;
}
