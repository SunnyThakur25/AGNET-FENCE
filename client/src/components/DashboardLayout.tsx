import React, { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { SignInPage } from "@/pages/Public";
import { Activity, Archive, BellRing, Building2, ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck, CreditCard, Ellipsis, FileCheck2, Gauge, GitBranch, KeyRound, LayoutDashboard, LockKeyhole, LogOut, MonitorCog, Moon, Network, Radar, ScanLine, Search, Settings2, ShieldAlert, ShieldCheck, Siren, Sun, TerminalSquare, UserRound, UsersRound, Waypoints } from "lucide-react";
import { useLocation } from "wouter";
import { AgentFenceLogo } from "./AgentFenceLogo";
import { useTheme } from "@/contexts/ThemeContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";

export function ThemeToggle({ theme, toggleTheme }: { theme: "light" | "dark"; toggleTheme: () => void }) {
  return <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} aria-pressed={theme === "dark"}>{theme === "dark" ? <span>Dark mode</span> : <span>Light mode</span>}{theme === "dark" ? <span className="theme-toggle-track"><span className="theme-toggle-thumb"><Moon size={12} /></span></span> : <span className="theme-toggle-track"><span className="theme-toggle-thumb theme-toggle-thumb-light"><Sun size={12} /></span></span>}</button>;
}

export function SidebarCollapseToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return <button type="button" className="sidebar-collapse-toggle" onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-pressed={collapsed} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}</button>;
}

type NavItem = { label: string; path: string; icon: React.ComponentType<{ size?: number }> };

const primaryNavigation: NavItem[] = [
  { label: "Command center", path: "/", icon: LayoutDashboard },
  { label: "Agent Registry", path: "/agents", icon: Radar },
  { label: "Policy Engine", path: "/policies", icon: ShieldCheck },
  { label: "Policy Governance", path: "/policy-governance", icon: GitBranch },
  { label: "Tool Gateway", path: "/gateway", icon: TerminalSquare },
  { label: "Native MCP Gateway", path: "/mcp-gateway", icon: Network },
  { label: "Operations center", path: "/operations", icon: Gauge },
  { label: "Incident response", path: "/incident-response", icon: Siren },
  { label: "Endpoint Operations", path: "/endpoints", icon: MonitorCog },
  { label: "Coverage posture", path: "/coverage", icon: Waypoints },
  { label: "Integrations", path: "/integrations", icon: TerminalSquare },
  { label: "Enterprise pilot", path: "/enterprise", icon: Building2 },
  { label: "Secure connectors", path: "/secure-connectors", icon: KeyRound },
  { label: "Team management", path: "/team", icon: UsersRound },
  { label: "Billing & plans", path: "/billing", icon: CreditCard },
];

const supplementaryNavigation: NavItem[] = [
  { label: "Action Capture", path: "/action-capture", icon: ScanLine },
  { label: "Action Trace", path: "/action-trace", icon: GitBranch },
  { label: "Approvals", path: "/approvals", icon: ClipboardCheck },
  { label: "Audit Ledger", path: "/audit", icon: Activity },
  { label: "Evidence anchoring", path: "/audit-anchoring", icon: Archive },
  { label: "Operational readiness", path: "/operational-readiness", icon: ClipboardCheck },
  { label: "Data Guard", path: "/data-guard", icon: LockKeyhole },
  { label: "Credential Vault", path: "/vault", icon: KeyRound },
  { label: "Attack Simulation", path: "/tests", icon: ShieldAlert },
  { label: "Compliance Evidence", path: "/compliance", icon: FileCheck2 },
  { label: "Settings", path: "/settings", icon: Settings2 },
];

function isActivePath(path: string, location: string) {
  return path === "/" ? location === "/" : location.startsWith(path);
}

function SidebarNavItem({ item, active, compact, onNavigate }: { item: NavItem; active: boolean; compact: boolean; onNavigate: (path: string) => void }) {
  const Icon = item.icon;
  const button = <button onClick={() => onNavigate(item.path)} aria-label={item.label} className={`nav-item ${active ? "active" : ""}`}><Icon size={17} /><span>{item.label}</span>{active && <span className="nav-active-dot" />}</button>;
  if (!compact) return button;
  return <Tooltip delayDuration={650}><TooltipTrigger asChild>{button}</TooltipTrigger><TooltipContent side="right" sideOffset={12} className="compact-nav-tooltip">{item.label}</TooltipContent></Tooltip>;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user, logout } = useAuth();
  const [location, navigate] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const hasSupplementaryActive = supplementaryNavigation.some(item => isActivePath(item.path, location));
  const [supplementaryOpen, setSupplementaryOpen] = useState(hasSupplementaryActive);

  useEffect(() => {
    try { setSidebarCollapsed(window.localStorage.getItem("agentfence-sidebar-collapsed") === "true"); } catch { /* Stored preference is optional. */ }
  }, []);
  useEffect(() => {
    if (hasSupplementaryActive) setSupplementaryOpen(true);
  }, [hasSupplementaryActive]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const toggleSidebar = () => setSidebarCollapsed(current => {
    const next = !current;
    try { window.localStorage.setItem("agentfence-sidebar-collapsed", String(next)); } catch { /* Stored preference is optional. */ }
    return next;
  });
  const selectRoute = (item: NavItem) => {
    if (supplementaryNavigation.some(entry => entry.path === item.path)) setSupplementaryOpen(true);
    navigate(item.path);
    setCommandOpen(false);
  };

  if (loading) return <div className="shell-loading"><ShieldCheck className="animate-pulse" /> Loading AgentFence…</div>;
  if (!user) return <SignInPage />;

  return <div className={sidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
    <aside className="app-sidebar" aria-label="AgentFence navigation">
      <div className="sidebar-top">
        <div className="sidebar-brand-row"><AgentFenceLogo /><SidebarCollapseToggle collapsed={sidebarCollapsed} onToggle={toggleSidebar} /></div>
        <div className="workspace-switcher"><span className="workspace-dot" /> <span>Security workspace</span><ChevronDown size={13} /></div>
        <Tooltip delayDuration={650}>
          <TooltipTrigger asChild><button type="button" className="sidebar-command-trigger" onClick={() => setCommandOpen(true)} aria-label="Search navigation"><Search size={15} /><span>Quick navigate</span><CommandShortcut>⌘K</CommandShortcut></button></TooltipTrigger>
          {sidebarCollapsed && <TooltipContent side="right" sideOffset={12} className="compact-nav-tooltip">Quick navigate (Ctrl/Cmd + K)</TooltipContent>}
        </Tooltip>
      </div>
      <nav className="sidebar-nav">
        {primaryNavigation.map(item => <SidebarNavItem key={item.path} item={item} active={isActivePath(item.path, location)} compact={sidebarCollapsed} onNavigate={navigate} />)}
        <div className={supplementaryOpen || hasSupplementaryActive ? "sidebar-nav-group open" : "sidebar-nav-group"}>
          <Tooltip delayDuration={650}>
            <TooltipTrigger asChild>
              <button type="button" className="nav-group-toggle" onClick={() => setSupplementaryOpen(open => !open)} aria-controls="supplementary-navigation" aria-expanded={supplementaryOpen || hasSupplementaryActive} aria-label="More governance and evidence navigation"><Ellipsis size={18} /><span>More governance & evidence</span><ChevronDown size={14} /></button>
            </TooltipTrigger>
            {sidebarCollapsed && <TooltipContent side="right" sideOffset={12} className="compact-nav-tooltip">More governance & evidence</TooltipContent>}
          </Tooltip>
          <div id="supplementary-navigation" className="supplementary-navigation">
            {supplementaryNavigation.map(item => <SidebarNavItem key={item.path} item={item} active={isActivePath(item.path, location)} compact={sidebarCollapsed} onNavigate={navigate} />)}
          </div>
        </div>
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-utility"><BellRing size={16} /><span>Notifications active</span><span className="utility-dot" /></div>
        <div className="profile-bar-wrap"><button type="button" className="user-block" aria-label="Open profile menu" aria-expanded={profileOpen} aria-controls="profile-bar-menu" onClick={() => setProfileOpen(open => !open)}><div className="user-avatar">{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.name?.slice(0, 1).toUpperCase() || "A"}</div><div className="min-w-0 flex-1 text-left"><p>{user.name || "AgentFence operator"}</p><span>{user.email || "Authenticated user"}</span></div><ChevronDown size={15} className={profileOpen ? "profile-chevron open" : "profile-chevron"} /></button>{profileOpen && <div id="profile-bar-menu" className="profile-bar-menu" role="menu"><button type="button" role="menuitem" onClick={() => { setProfileOpen(false); navigate("/profile"); }}><UserRound size={15} /><span><strong>Profile & account</strong><small>Personal details and avatar</small></span></button><button type="button" role="menuitem" onClick={() => { setProfileOpen(false); navigate("/security"); }}><LockKeyhole size={15} /><span><strong>Security & connections</strong><small>Password, sessions, deletion</small></span></button><button type="button" role="menuitem" className="profile-signout" onClick={async () => { setProfileOpen(false); await logout(); }}><LogOut size={15} /><span><strong>Sign out</strong><small>End this authenticated session</small></span></button></div>}</div>
      </div>
    </aside>
    <main className="app-main"><div className="top-status"><div className="environment-pill"><span /> Production controls ready</div><div className="top-status-actions"><div className="top-status-meta">Multi-tenant · Audit chained · Data Guard enabled</div>{toggleTheme && <ThemeToggle theme={theme} toggleTheme={toggleTheme} />}</div></div>{children}</main>
    <CommandDialog open={commandOpen} onOpenChange={setCommandOpen} title="Quick navigation" description="Search AgentFence workspaces and controls." className="agentfence-command-dialog">
      <CommandInput placeholder="Search workspaces, controls, or evidence…" />
      <CommandList>
        <CommandEmpty>No matching AgentFence workspace.</CommandEmpty>
        <CommandGroup heading="Core operations">
          {primaryNavigation.map(item => { const Icon = item.icon; return <CommandItem key={item.path} value={`${item.label} ${item.path}`} onSelect={() => selectRoute(item)} className={isActivePath(item.path, location) ? "command-route-item active" : "command-route-item"}><Icon size={16} /><span>{item.label}</span>{isActivePath(item.path, location) && <CommandShortcut>Current</CommandShortcut>}</CommandItem>; })}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Governance and evidence">
          {supplementaryNavigation.map(item => { const Icon = item.icon; return <CommandItem key={item.path} value={`${item.label} ${item.path}`} onSelect={() => selectRoute(item)} className={isActivePath(item.path, location) ? "command-route-item active" : "command-route-item"}><Icon size={16} /><span>{item.label}</span>{isActivePath(item.path, location) && <CommandShortcut>Current</CommandShortcut>}</CommandItem>; })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  </div>;
}
