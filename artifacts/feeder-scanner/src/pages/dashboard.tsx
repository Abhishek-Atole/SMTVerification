import { useListSessions, useListBoms, useGetAnalyticsOverview, getGetAnalyticsOverviewQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Boxes, CheckCircle2, Loader2, BarChart3, ScanLine, Clock } from "lucide-react";
import { useAuth } from "@/context/auth-context";

export default function Dashboard() {
  const { user } = useAuth();
  const { data: sessions, isLoading: sessionsLoading } = useListSessions();
  const { data: boms, isLoading: bomsLoading } = useListBoms();
  const { data: overview, isLoading: overviewLoading } = useGetAnalyticsOverview({
    query: { 
      queryKey: getGetAnalyticsOverviewQueryKey(),
      enabled: user?.role === "qa" || user?.role === "engineer" 
    }
  });

  if (sessionsLoading || bomsLoading || (overviewLoading && user?.role !== "operator")) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Defensive check: ensure sessions is an array
  const sessionsArray = Array.isArray(sessions) ? sessions : [];
  const bomsArray = Array.isArray(boms) ? boms : [];

  const activeSessions = sessionsArray.filter(s => s.status === "active");
  const completedSessions = sessionsArray.filter(s => s.status === "completed");
  const totalBoms = bomsArray.length;

  // OPERATOR VIEW
  if (user?.role === "operator") {
    return (
      <div className="p-8 max-w-6xl mx-auto w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col items-center justify-center py-12 text-center space-y-6">
          <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <ScanLine className="w-12 h-12 text-primary" />
          </div>
          <h1 className="text-4xl font-black tracking-tight text-foreground">Ready to Scan</h1>
          <p className="text-xl text-muted-foreground max-w-lg">
            Start a new verification session or resume an active one.
          </p>
          <Button asChild size="lg" className="h-16 px-12 text-xl font-bold tracking-wide rounded-full shadow-lg hover:shadow-xl transition-all" data-testid="btn-start-session">
            <Link href="/session/new">START NEW SESSION</Link>
          </Button>
        </div>

        {activeSessions.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold border-b border-border pb-2 flex items-center gap-2">
              <Play className="w-5 h-5 text-primary" /> Active Sessions
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeSessions.map(session => (
                <Card key={session.id} className="bg-card border-border hover:border-primary/50 transition-colors shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center justify-between">
                      <span className="truncate">{session.panelName}</span>
                      <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-md uppercase tracking-wider font-semibold">Active</span>
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">{session.shiftName} - {session.operatorName}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between items-end mt-2">
                      <div className="text-sm text-muted-foreground">
                        BOM: {session.bomName || session.bomId}
                      </div>
                      <Button asChild size="sm" className="font-bold tracking-wide" data-testid={`btn-resume-session-${session.id}`}>
                        <Link href={`/session/${session.id}`}>RESUME</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // QA ENGINEER VIEW
  if (user?.role === "qa") {
    return (
      <div className="p-8 max-w-6xl mx-auto w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-foreground">QA Dashboard</h1>
            <p className="text-muted-foreground mt-2">Quality & Performance Overview</p>
          </div>
          <Button asChild variant="outline" className="font-bold gap-2">
            <Link href="/analytics">
              <BarChart3 className="w-4 h-4" /> Full Analytics
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Scans</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold">{overview?.totalScans}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Overall OK Rate</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold text-success">{overview?.overallOkRate?.toFixed(1) || 0}%</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Reject Count</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold text-destructive">{overview?.totalReject}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Active Sessions</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold text-primary">{overview?.activeSessions}</div></CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-bold border-b border-border pb-2 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-success" /> Recently Completed Sessions
          </h2>
          {completedSessions.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">No completed sessions.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {completedSessions.slice(0, 6).map(session => (
                <Card key={session.id} className="bg-card shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center justify-between">
                      <span className="truncate">{session.panelName}</span>
                      <span className="text-xs text-muted-foreground">{new Date(session.createdAt).toLocaleDateString()}</span>
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">BOM: {session.bomName || session.bomId}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-end">
                      <Button asChild variant="secondary" size="sm" className="font-medium">
                        <Link href={`/session/${session.id}/report`}>VIEW REPORT</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ENGINEER VIEW (Default)
  return (
    <div className="p-8 max-w-6xl mx-auto w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Engineer Dashboard</h1>
          <p className="text-muted-foreground mt-2">System Status & Management</p>
        </div>
        <div className="flex gap-3">
          <Button asChild variant="outline" className="font-bold gap-2">
            <Link href="/analytics">
              <BarChart3 className="w-4 h-4" /> Analytics
            </Link>
          </Button>
          <Button asChild className="font-bold tracking-wide" data-testid="btn-start-session">
            <Link href="/session/new">NEW SESSION</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-card border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex justify-between items-center">
              Active Sessions
              <Play className="w-4 h-4 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-primary">{activeSessions.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex justify-between items-center">
              Completed Sessions
              <CheckCircle2 className="w-4 h-4 text-success" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-foreground">{completedSessions.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex justify-between items-center">
              Total BOMs Configured
              <Boxes className="w-4 h-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-foreground">{totalBoms}</div>
            <div className="mt-2">
              <Button asChild variant="link" className="p-0 h-auto text-sm text-primary">
                <Link href="/bom">Manage BOMs &rarr;</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-bold border-b border-border pb-2 flex items-center gap-2">
          <Clock className="w-5 h-5" /> Active Sessions
        </h2>
        {activeSessions.length === 0 ? (
          <div className="p-8 text-center bg-secondary/30 rounded-lg border border-border border-dashed">
            <p className="text-muted-foreground font-medium">No active sessions. Start a new session to begin verification.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeSessions.map(session => (
              <Card key={session.id} className="bg-card border-border hover:border-primary/50 transition-colors shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span className="truncate">{session.panelName}</span>
                    <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-md uppercase tracking-wider font-semibold">Active</span>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{session.shiftName} - {session.operatorName}</p>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between items-end mt-2">
                    <div className="text-sm text-muted-foreground">
                      BOM: {session.bomName || session.bomId}
                    </div>
                    <Button asChild size="sm" className="font-bold tracking-wide" data-testid={`btn-resume-session-${session.id}`}>
                      <Link href={`/session/${session.id}`}>RESUME</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
