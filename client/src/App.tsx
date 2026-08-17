import { Toaster } from "@/components/ui/sonner";
import { ShieldCheck } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import { useLocation } from "wouter";
import DashboardLayout from "./components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AgentFenceWorkspaceProvider } from "./contexts/AgentFenceContext";
import { AgentRegistry, ApprovalsPage, AuditLedgerPage, CommandCenter, CompliancePage, CredentialVaultPage, DataGuardPage, PolicyEngine, SecurityTestsPage, ToolGateway, VaultSettingsPage } from "./pages/Console";
import { LandingPage, SignInPage, SignUpPage } from "./pages/Public";
import { useAuth } from "./_core/hooks/useAuth";

function ConsoleRoutes() {
  return <DashboardLayout><AgentFenceWorkspaceProvider><Switch><Route path="/" component={CommandCenter} /><Route path="/agents" component={AgentRegistry} /><Route path="/policies" component={PolicyEngine} /><Route path="/gateway" component={ToolGateway} /><Route path="/approvals" component={ApprovalsPage} /><Route path="/audit" component={AuditLedgerPage} /><Route path="/data-guard" component={DataGuardPage} /><Route path="/vault" component={CredentialVaultPage} /><Route path="/tests" component={SecurityTestsPage} /><Route path="/compliance" component={CompliancePage} /><Route path="/settings" component={VaultSettingsPage} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch></AgentFenceWorkspaceProvider></DashboardLayout>;
}

function RouteSurface({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  return <div className="route-surface" key={location}>{children}</div>;
}

function SignInRoute() { return <RouteSurface><SignInPage /></RouteSurface>; }
function SignUpRoute() { return <RouteSurface><SignUpPage /></RouteSurface>; }

function ApplicationEntry() {
  const { user, loading } = useAuth();
  const [location] = useLocation();
  if (loading) return <div className="shell-loading"><ShieldCheck className="animate-pulse" /> Loading AgentFence…</div>;
  if (!user && location === "/") return <RouteSurface><LandingPage /></RouteSurface>;
  return <RouteSurface><ConsoleRoutes /></RouteSurface>;
}

function Router() {
  return <Switch><Route path="/signin" component={SignInRoute} /><Route path="/signup" component={SignUpRoute} /><Route component={ApplicationEntry} /></Switch>;
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="dark"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
