import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation, Link } from "wouter";
import {
  useGetSession, useScanFeeder, useUpdateSession, useGetBom,
  useListSplices, useRecordSplice,
  getGetBomQueryKey, getGetSessionQueryKey, getListSplicesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, ScanLine, CheckCircle2, Circle, XCircle, Scissors, ArrowLeft, RefreshCw, X } from "lucide-react";
import { format, differenceInSeconds } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ScanStep = "feeder" | "spool";
type SpliceStep = "feeder" | "oldSpool" | "newSpool";
type Mode = "scan" | "splice";

interface LocalScanEntry {
  id: number;
  feederNumber: string;
  spoolBarcode?: string;
  partNumber?: string | null;
  status: "ok" | "reject";
  scannedAt: string;
  durationMs?: number;
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function formatElapsed(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function SessionActive() {
  const [, params] = useRoute("/session/:id");
  const sessionId = Number(params?.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: session, isLoading: sessionLoading } = useGetSession(sessionId, {
    query: { enabled: !!sessionId, queryKey: getGetSessionQueryKey(sessionId) },
  });
  const bomId = session?.bomId;
  const { data: bomDetail, isLoading: bomLoading } = useGetBom(bomId!, {
    query: { enabled: !!bomId, queryKey: getGetBomQueryKey(bomId!) },
  });
  const { data: splices, isLoading: splicesLoading } = useListSplices(sessionId, {
    query: { enabled: !!sessionId, queryKey: getListSplicesQueryKey(sessionId) },
  });

  const scanFeeder = useScanFeeder();
  const recordSplice = useRecordSplice();
  const updateSession = useUpdateSession();

  const [mode, setMode] = useState<Mode>("scan");
  const [scanStep, setScanStep] = useState<ScanStep>("feeder");
  const [pendingFeeder, setPendingFeeder] = useState("");
  const [feederScanTime, setFeederScanTime] = useState<number | null>(null);
  const [scanInput, setScanInput] = useState("");

  const [spliceStep, setSpliceStep] = useState<SpliceStep>("feeder");
  const [splicePendingFeeder, setSplicePendingFeeder] = useState("");
  const [splicePendingOldSpool, setSplicePendingOldSpool] = useState("");
  const [spliceStartTime, setSpliceStartTime] = useState<number | null>(null);
  const [spliceInput, setSpliceInput] = useState("");

  const [elapsed, setElapsed] = useState(0);
  const [lastScanResult, setLastScanResult] = useState<{
    status: "ok" | "reject" | "splice";
    feeder: string;
    msg: string;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focusInput = () => {
      if (document.activeElement !== inputRef.current && session?.status === "active") {
        inputRef.current?.focus();
      }
    };
    focusInput();
    const interval = setInterval(focusInput, 1000);
    return () => clearInterval(interval);
  }, [session?.status, mode]);

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

  const flashBg = (status: "ok" | "reject" | "splice") => {
    const bg = document.getElementById("scan-flash-bg");
    if (bg) {
      bg.classList.remove("flash-green", "flash-red");
      void bg.offsetWidth;
      if (status === "ok" || status === "splice") bg.classList.add("flash-green");
      else bg.classList.add("flash-red");
    }
  };

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = scanInput.trim();
    if (!val || session?.status !== "active") return;

    if (scanStep === "feeder") {
      setPendingFeeder(val);
      setFeederScanTime(Date.now());
      setScanInput("");
      setScanStep("spool");
    } else {
      const duration = feederScanTime ? Date.now() - feederScanTime : undefined;
      scanFeeder.mutate({
        sessionId,
        data: { feederNumber: pendingFeeder, spoolBarcode: val },
      }, {
        onSuccess: (res: any) => {
          setLastScanResult({
            status: res.status as "ok" | "reject",
            feeder: pendingFeeder,
            msg: res.message + (duration ? ` (${formatDuration(duration)})` : ""),
          });
          setScanInput("");
          setPendingFeeder("");
          setFeederScanTime(null);
          setScanStep("feeder");
          queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(sessionId) });
          flashBg(res.status);
        },
        onError: (err: any) => {
          setLastScanResult({ status: "reject", feeder: pendingFeeder, msg: err?.message || "Scan failed" });
          setScanInput("");
          setPendingFeeder("");
          setFeederScanTime(null);
          setScanStep("feeder");
          flashBg("reject");
        },
      });
    }
  };

  const handleSpliceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = spliceInput.trim();
    if (!val) return;

    if (spliceStep === "feeder") {
      setSplicePendingFeeder(val);
      setSpliceStartTime(Date.now());
      setSpliceInput("");
      setSpliceStep("oldSpool");
    } else if (spliceStep === "oldSpool") {
      setSplicePendingOldSpool(val);
      setSpliceInput("");
      setSpliceStep("newSpool");
    } else {
      const durationSeconds = spliceStartTime ? Math.round((Date.now() - spliceStartTime) / 1000) : undefined;
      recordSplice.mutate({
        sessionId,
        data: {
          feederNumber: splicePendingFeeder,
          oldSpoolBarcode: splicePendingOldSpool,
          newSpoolBarcode: val,
          durationSeconds,
        },
      }, {
        onSuccess: () => {
          setLastScanResult({
            status: "splice",
            feeder: splicePendingFeeder,
            msg: `Splice complete on feeder ${splicePendingFeeder}` + (durationSeconds ? ` in ${durationSeconds}s` : ""),
          });
          setSpliceInput("");
          setSplicePendingFeeder("");
          setSplicePendingOldSpool("");
          setSpliceStartTime(null);
          setSpliceStep("feeder");
          setMode("scan");
          queryClient.invalidateQueries({ queryKey: getListSplicesQueryKey(sessionId) });
          flashBg("splice");
        },
        onError: (err: any) => {
          setLastScanResult({ status: "reject", feeder: splicePendingFeeder, msg: err?.message || "Splice failed" });
          setSpliceInput("");
          setSplicePendingFeeder("");
          setSplicePendingOldSpool("");
          setSpliceStep("feeder");
          setMode("scan");
          flashBg("reject");
        },
      });
    }
  };

  const cancelSplice = () => {
    setSpliceInput("");
    setSplicePendingFeeder("");
    setSplicePendingOldSpool("");
    setSpliceStep("feeder");
    setSpliceStartTime(null);
    setMode("scan");
  };

  const handleEndSession = () => {
    if (confirm("End this verification session?")) {
      updateSession.mutate(
        { sessionId, data: { status: "completed", endTime: new Date().toISOString() } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(sessionId) });
            setLocation(`/session/${sessionId}/report`);
          },
        }
      );
    }
  };

  const handleCancelSession = () => {
    if (
      confirm(
        "CANCEL this session? This will discard all scans and mark it as cancelled.\n\nThis action cannot be undone. Continue?"
      )
    ) {
      updateSession.mutate(
        { sessionId, data: { status: "cancelled", endTime: new Date().toISOString() } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(sessionId) });
            setLocation("/sessions");
          },
          onError: (err: any) => {
            alert(`Failed to cancel session: ${err?.message || "Unknown error"}`);
          },
        }
      );
    }
  };

  if (sessionLoading || (session?.bomId && bomLoading) || !session) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  const okScans = session.scans.filter((s) => s.status === "ok");
  const uniqueOkScans = new Set(okScans.map((s) => s.feederNumber)).size;
  const totalBomItems = bomDetail?.items.length || 0;

  const feederStatusMap: Record<string, "ok" | "reject" | "pending"> = {};
  bomDetail?.items.forEach((item) => {
    const okScan = session.scans.find((s) => s.feederNumber === item.feederNumber && s.status === "ok");
    if (okScan) {
      feederStatusMap[item.feederNumber] = "ok";
    } else {
      const rejectScan = session.scans.find((s) => s.feederNumber === item.feederNumber && s.status === "reject");
      feederStatusMap[item.feederNumber] = rejectScan ? "reject" : "pending";
    }
  });

  const spliceStepLabels: Record<SpliceStep, string> = {
    feeder: "STEP 1 / 3 — Scan FEEDER NUMBER",
    oldSpool: `STEP 2 / 3 — Scan OLD SPOOL barcode (Feeder: ${splicePendingFeeder})`,
    newSpool: `STEP 3 / 3 — Scan NEW SPOOL barcode (Feeder: ${splicePendingFeeder})`,
  };

  const scanStepLabels: Record<ScanStep, string> = {
    feeder: "STEP 1 / 2 — Scan FEEDER NUMBER",
    spool: `STEP 2 / 2 — Scan SPOOL BARCODE / QR (Feeder: ${pendingFeeder})`,
  };

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
          {session.status === "active" ? (
            <div className="flex gap-2">
              <Button variant="destructive" className="font-bold tracking-widest" onClick={handleEndSession}>
                END SESSION
              </Button>
              <Button
                variant="outline"
                className="font-bold tracking-widest border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={handleCancelSession}
              >
                <X className="w-4 h-4 mr-2" />
                CANCEL
              </Button>
            </div>
          ) : (
            <Button asChild className="font-bold tracking-widest">
              <Link href={`/session/${session.id}/report`}>VIEW REPORT</Link>
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel */}
        <div className="flex-1 flex flex-col p-6 gap-6 overflow-y-auto border-r border-border bg-background/50">

          {session.status === "active" && (
            <>
              {/* Mode Tabs */}
              <div className="flex gap-3">
                <Button
                  variant={mode === "scan" ? "default" : "outline"}
                  className="flex-1 h-12 font-bold tracking-wider"
                  onClick={() => { setMode("scan"); setScanStep("feeder"); setScanInput(""); }}
                >
                  <ScanLine className="w-5 h-5 mr-2" /> SCAN MODE
                </Button>
                <Button
                  variant={mode === "splice" ? "default" : "outline"}
                  className={`flex-1 h-12 font-bold tracking-wider ${mode === "splice" ? "bg-amber-500 hover:bg-amber-600 border-amber-500" : "border-amber-500 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950"}`}
                  onClick={() => { setMode("splice"); setSpliceStep("feeder"); setSpliceInput(""); }}
                >
                  <Scissors className="w-5 h-5 mr-2" /> SPLICE MODE
                </Button>
              </div>

              {/* SCAN MODE */}
              {mode === "scan" && (
                <div className="bg-card border-2 border-primary/50 p-8 rounded-xl shadow-[0_0_20px_rgba(var(--primary),0.1)]">
                  <form onSubmit={handleScanSubmit} className="flex flex-col items-center gap-6">
                    <Label className="text-xl tracking-widest text-primary flex items-center gap-2 font-black uppercase">
                      <ScanLine className="w-6 h-6" />
                      {scanStepLabels[scanStep]}
                    </Label>
                    <div className="w-full flex gap-2 items-center justify-center">
                      {scanStep === "spool" && (
                        <Button type="button" variant="ghost" size="icon" className="shrink-0 h-16 w-16" onClick={() => { setScanStep("feeder"); setPendingFeeder(""); setFeederScanTime(null); setScanInput(""); }}>
                          <ArrowLeft className="w-6 h-6" />
                        </Button>
                      )}
                      <Input
                        ref={inputRef}
                        value={scanInput}
                        onChange={(e) => setScanInput(e.target.value)}
                        className="flex-1 text-center text-4xl h-24 font-mono tracking-[0.2em] bg-background border-2 border-border focus-visible:border-primary rounded-lg shadow-inner"
                        placeholder={scanStep === "feeder" ? "SCAN FEEDER NO..." : "SCAN SPOOL BARCODE..."}
                        autoFocus
                        autoComplete="off"
                      />
                    </div>
                    {scanStep === "spool" && (
                      <p className="text-sm text-muted-foreground">Feeder number <strong className="text-foreground font-mono">{pendingFeeder}</strong> scanned — now scan its spool barcode or QR code</p>
                    )}
                  </form>
                </div>
              )}

              {/* SPLICE MODE */}
              {mode === "splice" && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-400 p-8 rounded-xl">
                  <form onSubmit={handleSpliceSubmit} className="flex flex-col items-center gap-6">
                    <Label className="text-xl tracking-widest text-amber-600 dark:text-amber-400 flex items-center gap-2 font-black uppercase">
                      <Scissors className="w-6 h-6" />
                      {spliceStepLabels[spliceStep]}
                    </Label>
                    <Input
                      ref={inputRef}
                      value={spliceInput}
                      onChange={(e) => setSpliceInput(e.target.value)}
                      className="w-full max-w-2xl text-center text-4xl h-24 font-mono tracking-[0.2em] bg-background border-2 border-amber-300 focus-visible:border-amber-500 rounded-lg shadow-inner"
                      placeholder={
                        spliceStep === "feeder" ? "SCAN FEEDER NO..." :
                        spliceStep === "oldSpool" ? "SCAN OLD SPOOL..." :
                        "SCAN NEW SPOOL..."
                      }
                      autoFocus
                      autoComplete="off"
                    />
                    {spliceStep !== "feeder" && spliceStartTime && (
                      <p className="text-sm text-amber-700 dark:text-amber-400">
                        Splice timer: <strong>{Math.round((Date.now() - spliceStartTime) / 1000)}s</strong>
                      </p>
                    )}
                    <Button type="button" variant="ghost" className="text-muted-foreground" onClick={cancelSplice}>
                      Cancel Splice
                    </Button>
                  </form>
                </div>
              )}
            </>
          )}

          {/* Feedback Area */}
          <div className="h-40 flex items-center justify-center shrink-0">
            {lastScanResult ? (
              <div className={`w-full h-full flex flex-col items-center justify-center rounded-xl border-2 shadow-lg transition-all ${
                lastScanResult.status === "ok" ? "bg-success/10 border-success text-success" :
                lastScanResult.status === "splice" ? "bg-amber-50 dark:bg-amber-950/30 border-amber-400 text-amber-600 dark:text-amber-400" :
                "bg-destructive/10 border-destructive text-destructive"
              }`}>
                <div className="flex items-center gap-4">
                  {lastScanResult.status === "ok" && <CheckCircle2 className="w-12 h-12" />}
                  {lastScanResult.status === "splice" && <Scissors className="w-12 h-12" />}
                  {lastScanResult.status === "reject" && <XCircle className="w-12 h-12" />}
                  <div className="text-4xl font-black tracking-widest uppercase">
                    {lastScanResult.status === "splice" ? "SPLICED" : lastScanResult.status}
                  </div>
                </div>
                <div className="text-base mt-3 font-bold tracking-wide text-center px-4">
                  {lastScanResult.msg}
                </div>
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center border-2 border-dashed border-border rounded-xl text-muted-foreground font-medium text-lg bg-card/50">
                Ready — scan feeder number to begin
              </div>
            )}
          </div>

          {/* Scan History + Splice Log (tabbed) */}
          <Card className="flex-1 flex flex-col overflow-hidden border-border shadow-sm">
            <CardHeader className="bg-secondary/30 py-3 px-4 border-b border-border">
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm font-bold tracking-wider uppercase text-muted-foreground">Scan Log</CardTitle>
                <div className="flex items-center gap-4 text-sm font-bold">
                  <span className="text-primary">{session.scans.length} scans</span>
                  <span className="text-amber-500">{splices?.length ?? 0} splices</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden">
              <ScrollArea className="h-full w-full">
                <div className="p-4 space-y-2">
                  {/* Splice records first (inline, amber) */}
                  {splices && splices.length > 0 && splices.map((sp) => (
                    <div key={`splice-${sp.id}`} className="flex items-center justify-between p-3 border rounded-md font-mono text-sm shadow-sm bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                      <div className="flex items-center gap-4">
                        <Scissors className="w-4 h-4 text-amber-600 shrink-0" />
                        <span className="font-bold text-amber-700 dark:text-amber-400 w-16">SPLICE</span>
                        <span className="font-bold text-base">{sp.feederNumber}</span>
                        <span className="text-muted-foreground text-xs">{sp.oldSpoolBarcode} → {sp.newSpoolBarcode}</span>
                        {sp.durationSeconds != null && <span className="text-muted-foreground text-xs">{sp.durationSeconds}s</span>}
                      </div>
                      <div className="text-muted-foreground text-xs font-medium shrink-0">
                        {format(new Date(sp.splicedAt), "HH:mm:ss")}
                      </div>
                    </div>
                  ))}
                  {[...session.scans].reverse().map((scan) => (
                    <div key={scan.id} className={`flex items-center justify-between p-3 border rounded-md font-mono text-sm shadow-sm transition-colors ${
                      scan.status === "ok" ? "bg-success/5 border-success/20 text-foreground" : "bg-destructive/5 border-destructive/20 text-foreground"
                    }`}>
                      <div className="flex items-center gap-4">
                        <span className={`w-16 font-black uppercase tracking-wider ${scan.status === "ok" ? "text-success" : "text-destructive"}`}>
                          {scan.status}
                        </span>
                        <span className="font-bold text-base">{scan.feederNumber}</span>
                        {(scan as any).spoolBarcode && <span className="text-muted-foreground text-xs">Spool: {(scan as any).spoolBarcode}</span>}
                        {scan.partNumber && <span className="text-muted-foreground ml-2">Part: {scan.partNumber}</span>}
                      </div>
                      <div className="text-muted-foreground text-xs font-medium">
                        {format(new Date(scan.scannedAt), "HH:mm:ss")}
                      </div>
                    </div>
                  ))}
                  {session.scans.length === 0 && !splices?.length && (
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
                const hasSplice = splices?.some((sp) => sp.feederNumber === item.feederNumber);
                const canRescan = session.status === "active" && (status === "reject" || status === "pending");
                return (
                  <div key={item.id} className={`flex items-center justify-between p-3 rounded-lg border shadow-sm transition-colors ${
                    status === "ok" ? "bg-success/5 border-success/30" :
                    status === "reject" ? "bg-destructive/5 border-destructive/30" :
                    "bg-background border-border"
                  }`}>
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold font-mono text-sm truncate">{item.feederNumber}</span>
                        {hasSplice && <Scissors className="w-3 h-3 text-amber-500 shrink-0" />}
                      </div>
                      <span className="text-xs text-muted-foreground truncate font-medium mt-0.5">{item.partNumber}</span>
                    </div>
                    <div className="shrink-0 ml-2 flex items-center gap-2">
                      {canRescan && (
                        <button
                          title="Re-scan this feeder (skip to spool scan)"
                          onClick={() => {
                            setMode("scan");
                            setPendingFeeder(item.feederNumber);
                            setFeederScanTime(Date.now());
                            setScanStep("spool");
                            setScanInput("");
                            setTimeout(() => inputRef.current?.focus(), 50);
                          }}
                          className="text-primary hover:text-primary/70 transition-colors p-1 rounded"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      )}
                      {status === "ok" && <CheckCircle2 className="w-6 h-6 text-success" />}
                      {status === "reject" && <XCircle className="w-6 h-6 text-destructive" />}
                      {status === "pending" && <Circle className="w-6 h-6 text-muted-foreground/30" />}
                    </div>
                  </div>
                );
              })}
              {!bomDetail?.items.length && (
                <div className="p-8 text-center text-sm text-muted-foreground font-medium border border-dashed border-border rounded-lg mt-4">
                  No items in this BOM.
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Splice summary */}
          {(splices?.length ?? 0) > 0 && (
            <div className="p-3 border-t border-border bg-amber-50/50 dark:bg-amber-950/20">
              <div className="text-xs font-bold text-amber-600 dark:text-amber-400 tracking-wider mb-2 flex items-center gap-1">
                <Scissors className="w-3 h-3" /> {splices?.length} SPLICE{(splices?.length ?? 0) > 1 ? "S" : ""} RECORDED
              </div>
              <div className="space-y-1">
                {splices?.map((sp) => (
                  <div key={sp.id} className="text-xs text-muted-foreground font-mono flex justify-between">
                    <span>{sp.feederNumber}</span>
                    <span>{sp.durationSeconds != null ? `${sp.durationSeconds}s` : format(new Date(sp.splicedAt), "HH:mm")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progress bar */}
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
