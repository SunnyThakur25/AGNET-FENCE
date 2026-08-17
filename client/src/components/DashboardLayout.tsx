import React from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { SignInPage } from "@/pages/Public";
import { Activity, BellRing, ChevronDown, ClipboardCheck, FileCheck2, GitBranch, KeyRound, LayoutDashboard, LockKeyhole, LogOut, Moon, Radar, ScanLine, Settings2, ShieldAlert, ShieldCheck, Sun, TerminalSquare } from "lucide-react";
import { useLocation } from "wouter";
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
  if (loading) return <div className="shell-loading"><ShieldCheck className="animate-pulse" /> Loading AgentFence…</div>;
  if (!user) return <SignInPage />;
  return <div className="app-shell"><aside className="app-sidebar"><div className="sidebar-top"><AgentFenceLogo /><div className="workspace-switcher"><span className="workspace-dot" /> <span>Security workspace</span><ChevronDown size={13} /></div></div><nav className="sidebar-nav">{navigation.map(item => { const active = item.path === "/" ? location === "/" : location.startsWith(item.path); return <button key={item.path} onClick={() => navigate(item.path)} className={`nav-item ${active ? "active" : ""}`}><item.icon size={17} /><span>{item.label}</span>{active && <span className="nav-active-dot" />}</button>; })}</nav><div className="sidebar-bottom"><div className="sidebar-utility"><BellRing size={16} /><span>Notifications active</span><span className="utility-dot" /></div><div className="user-block"><div className="user-avatar">{user.name?.slice(0, 1).toUpperCase() || "A"}</div><div className="min-w-0 flex-1"><p>{user.name || "AgentFence operator"}</p><span>{user.email || "Authenticated user"}</span></div><button onClick={logout} className="logout-button" aria-label="Sign out"><LogOut size={15} /></button></div></div></aside><main className="app-main"><div className="top-status"><div className="environment-pill"><span /> Production controls ready</div><div className="top-status-actions"><div className="top-status-meta">Multi-tenant · Audit chained · Data Guard enabled</div>{toggleTheme && <ThemeToggle theme={theme} toggleTheme={toggleTheme} />}</div></div>{children}</main></div>;
}
