import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useGetSession, useScanFeeder, useUpdateSession, useGetBom, getGetBomQueryKey, getGetSessionQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, ScanLine, CheckCircle2, Circle, XCircle } from "lucide-react";
import { format, differenceInSeconds } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SessionActive() {
  const [, params] = useRoute("/session/:id");
  const sessionId = Number(params?.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: session, isLoading: sessionLoading } = useGetSession(sessionId, { query: { enabled: !!sessionId, queryKey: getGetSessionQueryKey(sessionId) } });
  
  const bomId = session?.bomId;
  const { data: bomDetail, isLoading: bomLoading } = useGetBom(bomId!, { query: { enabled: !!bomId, queryKey: getGetBomQueryKey(bomId!) } });

  const scanFeeder = useScanFeeder();
  const updateSession = useUpdateSession();

  const [feederInput, setFeederInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  
  const [elapsed, setElapsed] = useState(0);
  const [lastScanResult, setLastScanResult] = useState<{status: 'ok' | 'reject', feeder: string, msg: string} | null>(null);

  useEffect(() => {
    const focusInput = () => {
      if (document.activeElement !== inputRef.current && session?.status === 'active') {
        inputRef.current?.focus();
      }
    };
    
    focusInput();
    const interval = setInterval(focusInput, 1000);
    return () => clearInterval(interval);
  }, [session?.status]);

  useEffect(() => {
    if (session?.startTime) {
      const start = new Date(session.startTime);
      const timer = setInterval(() => {
        const end = session.endTime ? new Date(session.endTime) : new Date();
        setElapsed(differenceInSeconds(end, start));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [session?.startTime, session?.endTime]);

  const handleScanWithId = (e: React.FormEvent) => {
    e.preventDefault();
    const val = feederInput.trim();
    if (!val || session?.status !== 'active') return;

    // @ts-ignore
    scanFeeder.mutate({
      sessionId,
      data: { feederNumber: val }
    }, {
      onSuccess: (res: any) => {
        setLastScanResult({
          status: res.status as 'ok' | 'reject',
          feeder: val,
          msg: res.message
        });
        setFeederInput("");
        queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(sessionId) });

        const bg = document.getElementById("scan-flash-bg");
        if (bg) {
          bg.classList.remove("flash-green", "flash-red");
          void bg.offsetWidth;
          bg.classList.add(res.status === 'ok' ? 'flash-green' : 'flash-red');
        }
      },
      onError: (err: any) => {
        setLastScanResult({ status: 'reject', feeder: val, msg: err?.message || "Scan failed or rejected" });
        setFeederInput("");
        const bg = document.getElementById("scan-flash-bg");
        if (bg) {
          bg.classList.remove("flash-green", "flash-red");
          void bg.offsetWidth;
          bg.classList.add('flash-red');
        }
      }
    });
  };

  const formatElapsed = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleEndSession = () => {
    if (confirm("End this verification session?")) {
      updateSession.mutate({
        sessionId,
        data: { status: "completed", endTime: new Date().toISOString() }
      }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(sessionId) });
          setLocation(`/session/${sessionId}/report`);
        }
      });
    }
  };

  if (sessionLoading || (session?.bomId && bomLoading) || !session) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  const okScans = session.scans.filter(s => s.status === 'ok');
  const uniqueOkScans = new Set(okScans.map(s => s.feederNumber)).size;
  const totalBomItems = bomDetail?.items.length || 0;

  // Compute status map for checklist
  const feederStatusMap: Record<string, 'ok' | 'reject' | 'pending'> = {};
  bomDetail?.items.forEach(item => {
    const okScan = session.scans.find(s => s.feederNumber === item.feederNumber && s.status === 'ok');
    if (okScan) {
      feederStatusMap[item.feederNumber] = 'ok';
    } else {
      const rejectScan = session.scans.find(s => s.feederNumber === item.feederNumber && s.status === 'reject');
      if (rejectScan) {
        feederStatusMap[item.feederNumber] = 'reject';
      } else {
        feederStatusMap[item.feederNumber] = 'pending';
      }
    }
  });

  return (
    <div id="scan-flash-bg" className="h-[100dvh] w-full flex flex-col transition-colors duration-1000 bg-background overflow-hidden">
      {/* Header */}
      <header className="bg-card border-b border-border p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0 shadow-sm z-10 relative">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-2 text-sm">
          <div><span className="text-muted-foreground font-medium">PANEL:</span> <span className="font-bold text-primary ml-2">{session.panelName}</span></div>
          <div><span className="text-muted-foreground font-medium">BOM:</span> <span className="font-bold ml-2">{session.bomName || session.bomId}</span></div>
          <div><span className="text-muted-foreground font-medium">OPERATOR:</span> <span className="font-bold ml-2">{session.operatorName}</span></div>
          <div><span className="text-muted-foreground font-medium">SHIFT:</span> <span className="font-bold ml-2">{session.shiftName}</span></div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right flex flex-col items-end">
            <div className="text-muted-foreground text-xs font-bold tracking-wider">ELAPSED TIME</div>
            <div className="text-2xl font-mono font-black tracking-widest">{formatElapsed(elapsed)}</div>
          </div>
          {session.status === 'active' ? (
            <Button variant="destructive" className="font-bold tracking-widest" onClick={handleEndSession}>END SESSION</Button>
          ) : (
            <Button asChild className="font-bold tracking-widest bg-success text-success-foreground hover:bg-success/90">
              <Link href={`/session/${session.id}/report`}>VIEW REPORT</Link>
            </Button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Panel: Scanning & Feedback */}
        <div className="flex-1 flex flex-col p-6 gap-6 overflow-y-auto border-r border-border bg-background/50">
          
          {session.status === 'active' && (
            <div className="bg-card border-2 border-primary/50 p-8 rounded-xl shadow-[0_0_20px_rgba(var(--primary),0.1)]">
              <form onSubmit={handleScanWithId} className="flex flex-col items-center gap-6">
                <Label className="text-xl tracking-widest text-primary flex items-center gap-2 font-black uppercase">
                  <ScanLine className="w-6 h-6" />
                  Awaiting Scanner Input
                </Label>
                <Input 
                  ref={inputRef}
                  value={feederInput}
                  onChange={e => setFeederInput(e.target.value)}
                  className="w-full max-w-2xl text-center text-4xl h-24 font-mono tracking-[0.2em] bg-background border-2 border-border focus-visible:border-primary focus-visible:ring-primary/20 rounded-lg shadow-inner"
                  placeholder="SCAN BARCODE..."
                  autoFocus
                  autoComplete="off"
                />
              </form>
            </div>
          )}

          {/* Feedback Area */}
          <div className="h-48 flex items-center justify-center shrink-0">
            {lastScanResult ? (
              <div className={`w-full h-full flex flex-col items-center justify-center rounded-xl border-2 shadow-lg transition-all ${
                lastScanResult.status === 'ok' 
                  ? 'bg-success/10 border-success text-success' 
                  : 'bg-destructive/10 border-destructive text-destructive'
              }`}>
                <div className="flex items-center gap-4">
                  {lastScanResult.status === 'ok' ? <CheckCircle2 className="w-16 h-16" /> : <XCircle className="w-16 h-16" />}
                  <div className="text-6xl font-black tracking-widest uppercase">
                    {lastScanResult.status}
                  </div>
                </div>
                <div className="text-xl mt-4 font-bold tracking-wide">
                  FEEDER: {lastScanResult.feeder} — {lastScanResult.msg}
                </div>
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center border-2 border-dashed border-border rounded-xl text-muted-foreground font-medium text-lg bg-card/50">
                Ready to scan first feeder
              </div>
            )}
          </div>

          {/* Scan History Log */}
          <Card className="flex-1 flex flex-col overflow-hidden border-border shadow-sm">
            <CardHeader className="bg-secondary/30 py-3 px-4 border-b border-border">
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm font-bold tracking-wider uppercase text-muted-foreground">Scan Log</CardTitle>
                <span className="text-sm font-bold text-primary">{session.scans.length} TOTAL SCANS</span>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden">
              <ScrollArea className="h-full w-full">
                <div className="p-4 space-y-2">
                  {[...session.scans].reverse().map(scan => (
                    <div key={scan.id} className={`flex items-center justify-between p-3 border rounded-md font-mono text-sm shadow-sm transition-colors ${
                      scan.status === 'ok' ? 'bg-success/5 border-success/20 text-foreground' : 'bg-destructive/5 border-destructive/20 text-foreground'
                    }`}>
                      <div className="flex items-center gap-4">
                        <span className={`w-20 font-black uppercase tracking-wider ${scan.status === 'ok' ? 'text-success' : 'text-destructive'}`}>
                          {scan.status}
                        </span>
                        <span className="font-bold text-base">{scan.feederNumber}</span>
                        {scan.partNumber && <span className="text-muted-foreground ml-4">Part: {scan.partNumber}</span>}
                      </div>
                      <div className="text-muted-foreground text-xs font-medium">
                        {format(new Date(scan.scannedAt), "HH:mm:ss")}
                      </div>
                    </div>
                  ))}
                  {session.scans.length === 0 && (
                    <div className="h-32 flex items-center justify-center text-muted-foreground text-sm font-medium">
                      No scans recorded yet
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel: BOM Checklist */}
        <div className="w-96 flex flex-col bg-card shrink-0 shadow-[-4px_0_15px_-5px_rgba(0,0,0,0.1)] z-10">
          <div className="p-4 border-b border-border bg-secondary/30 flex justify-between items-center">
            <h2 className="font-bold tracking-wider uppercase">BOM Checklist</h2>
            <div className="text-sm font-bold bg-background px-3 py-1 rounded-full border border-border shadow-sm">
              <span className="text-success">{uniqueOkScans}</span> / {totalBomItems} verified
            </div>
          </div>
          
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {bomDetail?.items.map((item) => {
                const status = feederStatusMap[item.feederNumber];
                return (
                  <div key={item.id} className={`flex items-center justify-between p-3 rounded-lg border shadow-sm transition-colors ${
                    status === 'ok' ? 'bg-success/5 border-success/30' :
                    status === 'reject' ? 'bg-destructive/5 border-destructive/30' :
                    'bg-background border-border'
                  }`}>
                    <div className="flex flex-col min-w-0">
                      <span className={`font-bold font-mono text-sm truncate ${status === 'ok' ? 'text-foreground' : 'text-foreground'}`}>
                        {item.feederNumber}
                      </span>
                      <span className="text-xs text-muted-foreground truncate font-medium mt-0.5">{item.partNumber}</span>
                    </div>
                    <div className="shrink-0 ml-3">
                      {status === 'ok' && <CheckCircle2 className="w-6 h-6 text-success" />}
                      {status === 'reject' && <XCircle className="w-6 h-6 text-destructive" />}
                      {status === 'pending' && <Circle className="w-6 h-6 text-muted-foreground/30" />}
                    </div>
                  </div>
                );
              })}
              {bomDetail?.items.length === 0 && (
                <div className="p-8 text-center text-sm text-muted-foreground font-medium border border-dashed border-border rounded-lg mt-4">
                  No items in this BOM.
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Progress bar at the bottom of the checklist */}
          <div className="p-5 border-t border-border bg-background">
            <div className="flex justify-between text-xs font-bold mb-3 tracking-wider text-muted-foreground">
              <span>PROGRESS</span>
              <span className="text-foreground">{totalBomItems > 0 ? Math.round((uniqueOkScans / totalBomItems) * 100) : 0}%</span>
            </div>
            <div className="h-3 bg-secondary rounded-full overflow-hidden shadow-inner">
              <div 
                className="h-full bg-primary transition-all duration-500 ease-out" 
                style={{ width: `${totalBomItems > 0 ? (uniqueOkScans / totalBomItems) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
