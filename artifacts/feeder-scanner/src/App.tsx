import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import { AppShell } from "@/components/AppShell";

import Dashboard from "@/pages/dashboard";
import Boms from "@/pages/boms";
import BomDetail from "@/pages/bom-detail";
import BomReport from "@/pages/bom-report";
import SessionNew from "@/pages/session-new";
import SessionActive from "@/pages/session-active";
import SessionReport from "@/pages/session-report";
import SessionHistory from "@/pages/session-history";
import Login from "@/pages/login";
import Analytics from "@/pages/analytics";
import TrashBin from "@/pages/trash-bin";
import RealTimeDashboard from "@/pages/real-time-dashboard";
import Reports from "@/pages/reports";
import VerificationPage from "@/pages/verification";
import SplicingPage from "@/pages/splicing";
import { AuthProvider, useAuth } from "@/context/auth-context";
import { ThemeProvider } from "@/components/theme-provider";
import { NotificationProvider } from "@/components/NotificationSystem";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { appConfig } from "@/lib/appConfig";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component, allowedRoles }: { component: any, allowedRoles?: string[] }) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!user) {
      setLocation("/login");
    } else if (allowedRoles && !allowedRoles.includes(user.role)) {
      setLocation("/");
    }
  }, [user, setLocation, allowedRoles]);

  if (!user) return null;
  if (allowedRoles && !allowedRoles.includes(user.role)) return null;

  return <Component />;
}

function Router() {
  const { user } = useAuth();
  const [location] = useLocation();

  useEffect(() => {
    const routeLabelMap: Record<string, string> = {
      "/": "Dashboard",
      "/login": "Login",
      "/bom": "BOM",
      "/session/new": "New Session",
      "/session": "Session",
      "/verification": "Verification",
      "/splicing": "Splicing",
      "/sessions": "Session History",
      "/analytics": "Analytics",
      "/reports": "Reports",
      "/trash": "Trash",
      "/real-time-dashboard": "Real-Time Dashboard",
    };

    const exact = routeLabelMap[location];
    if (exact) {
      document.title = `${appConfig.companyShort} | ${exact}`;
      return;
    }

    if (location.startsWith("/session/")) {
      document.title = `${appConfig.companyShort} | Session`;
      return;
    }

    document.title = `${appConfig.companyShort} | ${appConfig.systemTitle}`;
  }, [location]);

  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route>
        {user ? (
          <AppShell jobId="SMT-JOB-001">
            <Layout>
              <Switch>
                <Route path="/">
                  {() => <ProtectedRoute component={Dashboard} allowedRoles={["engineer", "operator", "qa"]} />}
                </Route>
                <Route path="/bom">
                  {() => <ProtectedRoute component={Boms} allowedRoles={["engineer"]} />}
                </Route>
                <Route path="/bom/:id">
                  {() => <ProtectedRoute component={BomDetail} allowedRoles={["engineer"]} />}
                </Route>
                <Route path="/bom/:id/report">
                  {() => <ProtectedRoute component={BomReport} allowedRoles={["engineer"]} />}
                </Route>
                <Route path="/session/new">
                  {() => <ProtectedRoute component={SessionNew} allowedRoles={["engineer", "operator"]} />}
                </Route>
                <Route path="/verification">
                  {() => <ProtectedRoute component={VerificationPage} allowedRoles={["engineer", "operator", "qa"]} />}
                </Route>
                <Route path="/splicing">
                  {() => <ProtectedRoute component={SplicingPage} allowedRoles={["engineer", "operator", "qa"]} />}
                </Route>
                <Route path="/session/:id">
                  {() => <ProtectedRoute component={SessionActive} allowedRoles={["engineer", "operator", "qa"]} />}
                </Route>
                <Route path="/session/:id/report">
                  {() => <ProtectedRoute component={SessionReport} allowedRoles={["engineer", "operator", "qa"]} />}
                </Route>
                <Route path="/sessions" component={SessionHistory} />
                <Route path="/analytics">
                  {() => <ProtectedRoute component={Analytics} allowedRoles={["engineer", "qa"]} />}
                </Route>
                <Route path="/trash">
                  {() => <ProtectedRoute component={TrashBin} allowedRoles={["engineer"]} />}
                </Route>
                <Route path="/real-time-dashboard">
                  {() => <ProtectedRoute component={RealTimeDashboard} allowedRoles={["engineer", "qa"]} />}
                </Route>
                <Route path="/reports">
                  {() => <ProtectedRoute component={Reports} allowedRoles={["engineer", "qa"]} />}
                </Route>
                <Route component={NotFound} />
              </Switch>
            </Layout>
          </AppShell>
        ) : (
          <Login />
        )}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <ErrorBoundary>
              <NotificationProvider>
                <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
                  <Router />
                </WouterRouter>
                <Toaster />
              </NotificationProvider>
            </ErrorBoundary>
          </TooltipProvider>
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
