import { useListSessions, useListBoms } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Boxes, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

export default function Dashboard() {
  const { data: sessions, isLoading: sessionsLoading } = useListSessions();
  const { data: boms, isLoading: bomsLoading } = useListBoms();

  if (sessionsLoading || bomsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeSessions = sessions?.filter(s => s.status === "active") || [];
  const completedSessions = sessions?.filter(s => s.status === "completed") || [];
  
  const totalBoms = boms?.length || 0;

  return (
    <div className="p-8 max-w-6xl mx-auto w-full space-y-8">
      <div>
        <h1 className="text-3xl font-mono font-bold tracking-tight text-foreground">OPERATOR DASHBOARD</h1>
        <p className="text-muted-foreground mt-2">SMT Feeder Verification System</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex justify-between items-center">
              Active Sessions
              <Play className="w-4 h-4 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-mono font-bold text-primary">{activeSessions.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex justify-between items-center">
              Completed Sessions
              <CheckCircle2 className="w-4 h-4 text-success" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-mono font-bold text-foreground">{completedSessions.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex justify-between items-center">
              Total BOMs Configured
              <Boxes className="w-4 h-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-mono font-bold text-foreground">{totalBoms}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-4">
        <Button asChild size="lg" className="font-mono text-base tracking-tight rounded-sm" data-testid="btn-start-session">
          <Link href="/session/new">START NEW SESSION</Link>
        </Button>
        <Button asChild variant="secondary" size="lg" className="font-mono text-base tracking-tight rounded-sm" data-testid="btn-manage-boms">
          <Link href="/bom">MANAGE BOMS</Link>
        </Button>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-mono font-bold border-b border-border pb-2">ACTIVE SESSIONS</h2>
        {activeSessions.length === 0 ? (
          <p className="text-muted-foreground font-mono text-sm py-4">No active sessions. Start a new session to begin verification.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeSessions.map(session => (
              <Card key={session.id} className="bg-card border-border hover:border-primary transition-colors">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-mono flex items-center justify-between">
                    <span className="truncate">{session.panelName}</span>
                    <span className="text-xs px-2 py-1 bg-primary/20 text-primary rounded-sm uppercase tracking-wider">Active</span>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground font-mono">{session.shiftName} - {session.operatorName}</p>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between items-end mt-2">
                    <div className="text-sm text-muted-foreground font-mono">
                      BOM: {session.bomName || session.bomId}
                    </div>
                    <Button asChild size="sm" className="rounded-sm font-mono" data-testid={`btn-resume-session-${session.id}`}>
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
