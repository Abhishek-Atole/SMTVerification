import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";

import Dashboard from "@/pages/dashboard";
import Boms from "@/pages/boms";
import BomDetail from "@/pages/bom-detail";
import SessionNew from "@/pages/session-new";
import SessionActive from "@/pages/session-active";
import SessionReport from "@/pages/session-report";
import SessionHistory from "@/pages/session-history";
import Login from "@/pages/login";
import Analytics from "@/pages/analytics";
import TrashBin from "@/pages/trash-bin";
import { AuthProvider, useAuth } from "@/context/auth-context";
import { ThemeProvider } from "@/components/theme-provider";

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
  
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route>
        {user ? (
          <Layout>
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/bom">
                {() => <ProtectedRoute component={Boms} allowedRoles={["engineer"]} />}
              </Route>
              <Route path="/bom/:id">
                {() => <ProtectedRoute component={BomDetail} allowedRoles={["engineer"]} />}
              </Route>
              <Route path="/session/new">
                {() => <ProtectedRoute component={SessionNew} allowedRoles={["engineer", "operator"]} />}
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
              <Route component={NotFound} />
            </Switch>
          </Layout>
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
            <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
