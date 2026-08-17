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
import { ActionCapturePage, ActionTracePage, AgentRegistry, ApprovalsPage, AuditLedgerPage, CommandCenter, CompliancePage, CredentialVaultPage, DataGuardPage, IntegrationHubPage, PolicyEngine, SecurityTestsPage, ToolGateway, VaultSettingsPage } from "./pages/Console";
import { LandingPage, SignInPage, SignUpPage } from "./pages/Public";
import { ProfileAccountPage, SecurityConnectionsPage } from "./pages/Account";
import { BillingPage, EnterprisePilotPage, TeamManagementPage } from "./pages/Enterprise";
import PolicyGovernancePage from "./pages/PolicyGovernance";
import SecureConnectorSettingsPage from "./pages/SecureConnectorSettings";
import { useAuth } from "./_core/hooks/useAuth";

function EnterpriseRoute() { return <EnterprisePilotPage />; }

function ConsoleRoutes() {
  return <DashboardLayout><AgentFenceWorkspaceProvider><Switch><Route path="/" component={CommandCenter} /><Route path="/agents" component={AgentRegistry} /><Route path="/policies" component={PolicyEngine} /><Route path="/policy-governance" component={PolicyGovernancePage} /><Route path="/gateway" component={ToolGateway} /><Route path="/integrations" component={IntegrationHubPage} /><Route path="/enterprise" component={EnterpriseRoute} /><Route path="/secure-connectors" component={SecureConnectorSettingsPage} /><Route path="/team" component={TeamManagementPage} /><Route path="/billing" component={BillingPage} /><Route path="/action-capture" component={ActionCapturePage} /><Route path="/action-trace" component={ActionTracePage} /><Route path="/approvals" component={ApprovalsPage} /><Route path="/audit" component={AuditLedgerPage} /><Route path="/data-guard" component={DataGuardPage} /><Route path="/vault" component={CredentialVaultPage} /><Route path="/tests" component={SecurityTestsPage} /><Route path="/compliance" component={CompliancePage} /><Route path="/settings" component={VaultSettingsPage} /><Route path="/profile" component={ProfileAccountPage} /><Route path="/security" component={SecurityConnectionsPage} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch></AgentFenceWorkspaceProvider></DashboardLayout>;
}

function RouteSurface({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  return <div className="route-surface" key={location}>{children}</div>;
}

function SignInRoute() { return <RouteSurface><SignInPage /></RouteSurface>; }
function SignUpRoute() { return <RouteSurface><SignUpPage /></RouteSurface>; }
function LandingPreviewRoute() { return <RouteSurface><LandingPage /></RouteSurface>; }

function ApplicationEntry() {
  const { user, loading } = useAuth();
  const [location] = useLocation();
  if (loading) return <div className="shell-loading"><ShieldCheck className="animate-pulse" /> Loading AgentFence…</div>;
  if (!user && location === "/") return <RouteSurface><LandingPage /></RouteSurface>;
  return <RouteSurface><ConsoleRoutes /></RouteSurface>;
}

function Router() {
  return <Switch><Route path="/landing" component={LandingPreviewRoute} /><Route path="/signin" component={SignInRoute} /><Route path="/signup" component={SignUpRoute} /><Route component={ApplicationEntry} /></Switch>;
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
        switchable
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
