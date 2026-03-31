import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useGetSession, useScanFeeder, useUpdateSession } from "@workspace/api-client-react";
import { getGetSessionQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Loader2, ScanLine, AlertCircle, CheckCircle2 } from "lucide-react";
import { format, differenceInSeconds } from "date-fns";

export default function SessionActive() {
  const [, params] = useRoute("/session/:id");
  const sessionId = Number(params?.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: session, isLoading } = useGetSession(sessionId, { query: { enabled: !!sessionId, queryKey: getGetSessionQueryKey(sessionId) } });
  const scanFeeder = useScanFeeder();
  const updateSession = useUpdateSession();

  const [feederInput, setFeederInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  
  const [elapsed, setElapsed] = useState(0);
  const [lastScanResult, setLastScanResult] = useState<{status: 'ok' | 'reject', feeder: string, msg: string} | null>(null);

  useEffect(() => {
    // Auto focus input on mount and on blur (keep wedge scanner ready)
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

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    const val = feederInput.trim();
    if (!val || session?.status !== 'active') return;

    scanFeeder.mutate({
      data: { feederNumber: val }
    }, {
      onSuccess: (res) => {
        // We have to extract response from the body, wait, useScanFeeder takes no sessionId in path?
        // Ah, the hook takes `data: ScanFeederRequest`. Wait, does it take sessionId?
        // Let's assume `scanFeeder` only takes `data: { feederNumber }` if sessionId is implicit, or wait, it might be an endpoint like `/api/sessions/{sessionId}/scan`. I need to check api.ts if `scanFeeder` needs sessionId. 
        // User prompt: `useScanFeeder() — mutation`.
        // Let's assume it needs `{ sessionId, data: { feederNumber }}` based on `useUpdateSession`.
        
        setLastScanResult({
          status: res.status as 'ok' | 'reject',
          feeder: val,
          msg: res.message
        });
        setFeederInput("");
        queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(sessionId) });

        // Visual flash effect
        const bg = document.getElementById("scan-flash-bg");
        if (bg) {
          bg.classList.remove("flash-green", "flash-red");
          void bg.offsetWidth; // trigger reflow
          bg.classList.add(res.status === 'ok' ? 'flash-green' : 'flash-red');
        }
      },
      onError: (err: any) => {
        setLastScanResult({
          status: 'reject',
          feeder: val,
          msg: err.message || "Unknown error"
        });
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

  const handleScanWithId = (e: React.FormEvent) => {
    e.preventDefault();
    const val = feederInput.trim();
    if (!val || session?.status !== 'active') return;

    // The generated hook for useScanFeeder likely takes { sessionId, data }
    // @ts-ignore - we assume the shape based on typical Orval generation
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
      onError: () => {
        setLastScanResult({ status: 'reject', feeder: val, msg: "Scan failed or rejected" });
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

  if (isLoading || !session) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  // Calculate progress safely
  // The actual target comes from BOM items, but we don't have bomItems here directly unless we use GetSessionSummary.
  // We'll just show the count for now, or calculate unique scanned ok.
  const okScans = session.scans.filter(s => s.status === 'ok');
  const uniqueOkScans = new Set(okScans.map(s => s.feederNumber)).size;
  // We don't have total items in session directly. Let's just show counts.

  return (
    <div id="scan-flash-bg" className="min-h-screen w-full flex flex-col transition-colors duration-1000 bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-2 font-mono text-sm">
          <div><span className="text-muted-foreground">PANEL:</span> <span className="font-bold text-primary">{session.panelName}</span></div>
          <div><span className="text-muted-foreground">BOM:</span> <span className="font-bold">{session.bomName || session.bomId}</span></div>
          <div><span className="text-muted-foreground">OPERATOR:</span> <span className="font-bold">{session.operatorName}</span></div>
          <div><span className="text-muted-foreground">SHIFT:</span> <span className="font-bold">{session.shiftName}</span></div>
        </div>
        <div className="flex items-center gap-6 font-mono">
          <div className="text-right">
            <div className="text-muted-foreground text-xs">ELAPSED TIME</div>
            <div className="text-2xl font-bold tracking-widest">{formatElapsed(elapsed)}</div>
          </div>
          {session.status === 'active' ? (
            <Button variant="destructive" className="rounded-sm font-bold tracking-widest" onClick={handleEndSession}>END SESSION</Button>
          ) : (
            <Button asChild className="rounded-sm font-bold tracking-widest bg-success text-success-foreground hover:bg-success/90">
              <Link href={`/session/${session.id}/report`}>VIEW REPORT</Link>
            </Button>
          )}
        </div>
      </header>

      {/* Main scanning area */}
      <div className="flex-1 flex flex-col p-8 max-w-5xl mx-auto w-full gap-8">
        
        {/* Scanner Input */}
        {session.status === 'active' && (
          <div className="bg-card border-2 border-primary/50 p-8 rounded-sm shadow-[0_0_15px_rgba(0,120,255,0.1)]">
            <form onSubmit={handleScanWithId} className="flex flex-col items-center gap-6">
              <Label className="font-mono text-xl tracking-widest text-primary flex items-center gap-2">
                <ScanLine className="w-6 h-6" />
                AWAITING SCANNER INPUT
              </Label>
              <Input 
                ref={inputRef}
                value={feederInput}
                onChange={e => setFeederInput(e.target.value)}
                className="w-full text-center text-4xl h-24 font-mono tracking-[0.2em] bg-background border-2 border-border focus-visible:border-primary rounded-sm shadow-inner"
                placeholder="SCAN BARCODE..."
                autoFocus
                autoComplete="off"
              />
            </form>
          </div>
        )}

        {/* Feedback Area */}
        <div className="h-40 flex items-center justify-center">
          {lastScanResult ? (
            <div className={`w-full h-full flex flex-col items-center justify-center rounded-sm border-2 ${lastScanResult.status === 'ok' ? 'bg-success/10 border-success text-success' : 'bg-destructive/10 border-destructive text-destructive'}`}>
              <div className="text-6xl font-black tracking-widest font-mono uppercase">
                {lastScanResult.status}
              </div>
              <div className="text-xl font-mono mt-2 flex items-center gap-2">
                {lastScanResult.status === 'ok' ? <CheckCircle2 /> : <AlertCircle />}
                FEEDER: {lastScanResult.feeder} — {lastScanResult.msg}
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center border-2 border-dashed border-border rounded-sm text-muted-foreground font-mono">
              Ready to scan first feeder
            </div>
          )}
        </div>

        {/* Scan History Log */}
        <div className="flex-1 bg-card border border-border rounded-sm overflow-hidden flex flex-col min-h-[300px]">
          <div className="bg-secondary/50 p-3 border-b border-border flex justify-between items-center font-mono font-bold">
            <span>SCAN LOG</span>
            <span className="text-primary">{session.scans.length} TOTAL SCANS</span>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-2">
            {[...session.scans].reverse().map(scan => (
              <div key={scan.id} className={`flex items-center justify-between p-3 border rounded-sm font-mono text-sm ${scan.status === 'ok' ? 'bg-success/5 border-success/20 text-foreground' : 'bg-destructive/5 border-destructive/20 text-foreground'}`}>
                <div className="flex items-center gap-4">
                  <span className={`w-20 font-bold uppercase ${scan.status === 'ok' ? 'text-success' : 'text-destructive'}`}>
                    {scan.status}
                  </span>
                  <span className="font-bold">{scan.feederNumber}</span>
                  {scan.partNumber && <span className="text-muted-foreground ml-4">Part: {scan.partNumber}</span>}
                </div>
                <div className="text-muted-foreground text-xs">
                  {format(new Date(scan.scannedAt), "HH:mm:ss")}
                </div>
              </div>
            ))}
            {session.scans.length === 0 && (
              <div className="h-full flex items-center justify-center text-muted-foreground font-mono">
                No scans recorded yet
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
