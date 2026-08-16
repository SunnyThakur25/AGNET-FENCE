import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Activity, BellRing, ChevronDown, ClipboardCheck, FileCheck2, KeyRound, LayoutDashboard, LockKeyhole, LogOut, Radar, Settings2, ShieldAlert, ShieldCheck, TerminalSquare } from "lucide-react";
import { useLocation } from "wouter";
import { AgentFenceLogo } from "./AgentFenceLogo";

const navigation = [
  { label: "Command center", path: "/", icon: LayoutDashboard },
  { label: "Agent Registry", path: "/agents", icon: Radar },
  { label: "Policy Engine", path: "/policies", icon: ShieldCheck },
  { label: "Tool Gateway", path: "/gateway", icon: TerminalSquare },
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
  if (loading) return <div className="shell-loading"><ShieldCheck className="animate-pulse" /> Loading AgentFence…</div>;
  if (!user) return <div className="sign-in-screen"><div className="sign-in-panel"><AgentFenceLogo /><div><p className="eyebrow">Protected access</p><h1>Control AI action, not just AI output.</h1><p>Sign in to access the AgentFence governance console.</p></div><button className="btn-primary w-full justify-center" onClick={() => startLogin()}>Sign in securely <ChevronDown size={16} className="-rotate-90" /></button></div></div>;
  return <div className="app-shell"><aside className="app-sidebar"><div className="sidebar-top"><AgentFenceLogo /><div className="workspace-switcher"><span className="workspace-dot" /> <span>Security workspace</span><ChevronDown size={13} /></div></div><nav className="sidebar-nav">{navigation.map(item => { const active = item.path === "/" ? location === "/" : location.startsWith(item.path); return <button key={item.path} onClick={() => navigate(item.path)} className={`nav-item ${active ? "active" : ""}`}><item.icon size={17} /><span>{item.label}</span>{active && <span className="nav-active-dot" />}</button>; })}</nav><div className="sidebar-bottom"><div className="sidebar-utility"><BellRing size={16} /><span>Notifications active</span><span className="utility-dot" /></div><div className="user-block"><div className="user-avatar">{user.name?.slice(0, 1).toUpperCase() || "A"}</div><div className="min-w-0 flex-1"><p>{user.name || "AgentFence operator"}</p><span>{user.email || "Authenticated user"}</span></div><button onClick={logout} className="logout-button" aria-label="Sign out"><LogOut size={15} /></button></div></div></aside><main className="app-main"><div className="top-status"><div className="environment-pill"><span /> Production controls ready</div><div className="top-status-meta">Multi-tenant · Audit chained · Data Guard enabled</div></div>{children}</main></div>;
}
