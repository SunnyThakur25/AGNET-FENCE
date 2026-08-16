import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import DashboardLayout from "./components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AgentFenceWorkspaceProvider } from "./contexts/AgentFenceContext";
import { AgentRegistry, ApprovalsPage, AuditLedgerPage, CommandCenter, CompliancePage, CredentialVaultPage, DataGuardPage, PolicyEngine, SecurityTestsPage, ToolGateway } from "./pages/Console";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return <DashboardLayout><AgentFenceWorkspaceProvider><Switch><Route path="/" component={CommandCenter} /><Route path="/agents" component={AgentRegistry} /><Route path="/policies" component={PolicyEngine} /><Route path="/gateway" component={ToolGateway} /><Route path="/approvals" component={ApprovalsPage} /><Route path="/audit" component={AuditLedgerPage} /><Route path="/data-guard" component={DataGuardPage} /><Route path="/vault" component={CredentialVaultPage} /><Route path="/tests" component={SecurityTestsPage} /><Route path="/compliance" component={CompliancePage} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch></AgentFenceWorkspaceProvider></DashboardLayout>;
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
