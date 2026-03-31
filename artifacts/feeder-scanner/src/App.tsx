import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";

import Dashboard from "@/pages/dashboard";
import Boms from "@/pages/boms";
import BomDetail from "@/pages/bom-detail";
import SessionNew from "@/pages/session-new";
import SessionActive from "@/pages/session-active";
import SessionReport from "@/pages/session-report";
import SessionHistory from "@/pages/session-history";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/bom" component={Boms} />
        <Route path="/bom/:id" component={BomDetail} />
        <Route path="/session/new" component={SessionNew} />
        <Route path="/session/:id" component={SessionActive} />
        <Route path="/session/:id/report" component={SessionReport} />
        <Route path="/sessions" component={SessionHistory} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
