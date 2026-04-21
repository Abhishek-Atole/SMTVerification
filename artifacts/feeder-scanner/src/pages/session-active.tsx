// @ts-nocheck
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
import { Loader2, ScanLine, CheckCircle2, Circle, XCircle, Scissors, ArrowLeft, RefreshCw, X, AlertCircle } from "lucide-react";
import { format, differenceInSeconds } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlternateSelector } from "@/components/alternate-selector";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction } from "@/components/ui/alert-dialog";

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
  
  // Internal ID / MPN verification state
  const [internalIdInput, setInternalIdInput] = useState("");
  const [internalIdType, setInternalIdType] = useState<"mpn" | "internal_id">("mpn");
  const [caseConverted, setCaseConverted] = useState(false);
  const [isDuplicate, setIsDuplicate] = useState(false);
  
  // Notification dialog state
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [notificationType, setNotificationType] = useState<"error" | "duplicate" | "warning">("error");
  
  // Alternate selection state
  const [pendingAvailableOptions, setPendingAvailableOptions] = useState<{
    primary: any[];
    alternates: any[];
  } | null>(null);
  const [selectedItemIdForScan, setSelectedItemIdForScan] = useState<number | null>(null);
  const [needsAlternateSelection, setNeedsAlternateSelection] = useState(false);
  const [verificationMode, setVerificationMode] = useState<"manual" | "auto">("manual");
  const [pendingVerification, setPendingVerification] = useState<any>(null);
  const [verificationLocked, setVerificationLocked] = useState(false);
  const [lastVerificationTime, setLastVerificationTime] = useState<number | null>(null);
  const [verificationInProgress, setVerificationInProgress] = useState(false);
  const [autoAdvanceTimer, setAutoAdvanceTimer] = useState<NodeJS.Timeout | null>(null);

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
    const interval = setInterval(focusInput, 2000);
    return () => clearInterval(interval);
  }, [session?.status, mode]);

  useEffect(() => {
    return () => {
      if (autoAdvanceTimer) {
        clearTimeout(autoAdvanceTimer);
      }
    };
  }, [autoAdvanceTimer]);

  useEffect(() => {
    if (session?.startTime) {
      const start = new Date(session.startTime);
      const timer = setInterval(() => {
        const end = session.endTime ? new Date(session.endTime) : new Date();
        setElapsed(differenceInSeconds(end, start));
      }, 500);
      return () => clearInterval(timer);
    }
  }, [session?.startTime, session?.endTime]);

  // Show notification for errors and duplicates
  useEffect(() => {
    if (lastScanResult && lastScanResult.status === "reject") {
      const msgLower = lastScanResult.msg.toLowerCase();
      if (msgLower.includes("duplicate") || msgLower.includes("already") || msgLower.includes("violation")) {
        setNotificationType("duplicate");
        setNotificationMessage(lastScanResult.msg);
        setShowNotification(true);
      } else if (msgLower.includes("error") || msgLower.includes("failed")) {
        setNotificationType("error");
        setNotificationMessage(lastScanResult.msg);
        setShowNotification(true);
      }
    }
  }, [lastScanResult]);

  const flashBg = (status: "ok" | "reject" | "splice") => {
    const bg = document.getElementById("scan-flash-bg");
    if (bg) {
      bg.classList.remove("flash-green", "flash-red");
      void bg.offsetWidth;
      if (status === "ok" || status === "splice") bg.classList.add("flash-green");
      else bg.classList.add("flash-red");
    }
  };

  const handleVerifyPendingScan = async () => {
    if (!pendingVerification || verificationLocked) return;
    
    // Check for single-entry violation
    if (lastVerificationTime) {
      const timeDiff = Date.now() - lastVerificationTime;
      if (timeDiff < 5000) { // Within 5 seconds = same verification attempt
        setLastScanResult({
          status: "reject",
          feeder: pendingVerification.feederNumber,
          msg: "❌ ERROR: Single-entry violation detected! Wait before next scan.",
        });
        return;
      }
    }

    setVerificationInProgress(true);
    setVerificationLocked(true);

    try {
      await scanFeeder.mutateAsync({
        sessionId,
        data: {
          feederNumber: pendingVerification.feederNumber,
          mpnOrInternalId: pendingVerification.mpnOrInternalId || undefined,
          internalIdType: pendingVerification.internalIdType,
          verificationMode: "manual",
          selectedItemId: pendingVerification.selectedItemId,
        },
      });
      
      setLastVerificationTime(Date.now());
      setPendingVerification(null);
      setScanStep("feeder");
      setPendingFeeder("");
      setScanInput("");
      setInternalIdInput("");
      setCaseConverted(false);
      setPendingAvailableOptions(null);
      setSelectedItemIdForScan(null);
      queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(sessionId) });
    } catch (err: any) {
      setLastScanResult({
        status: "reject",
        feeder: pendingVerification.feederNumber,
        msg: err?.message || "Verification failed",
      });
    } finally {
      setVerificationInProgress(false);
      setVerificationLocked(false);
    }
  };

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = scanInput.trim();
    if (!val) return;

    if (scanStep === "feeder") {
      // STEP 1: FEEDER SCAN
      const bomItems = bomDetail?.items || [];
      const matchingItems = bomItems.filter(
        (item) =>
          item.feederNumber.trim().toUpperCase() === val.trim().toUpperCase()
      );

      const primaryItems = matchingItems.filter((item) => !item.isAlternate);
      const alternateItems = matchingItems.filter((item) => item.isAlternate);

      setPendingFeeder(val.trim().toUpperCase());
      setFeederScanTime(Date.now());
      setScanInput("");
      setCaseConverted(val !== val.trim().toUpperCase());

      if (alternateItems.length > 0) {
        // Show selector for choosing alternates
        setPendingAvailableOptions({
          primary: primaryItems,
          alternates: alternateItems,
        });
        setSelectedItemIdForScan(primaryItems[0]?.id || alternateItems[0]?.id || null);
        setNeedsAlternateSelection(true);
      } else {
        // In AUTO mode: auto-advance to MPN step after brief delay
        // In MANUAL mode: wait for user to press Enter again
        if (verificationMode === "auto") {
          const timer = setTimeout(() => {
            setScanStep("spool");
            setNeedsAlternateSelection(false);
            inputRef.current?.focus();
          }, 200);
          setAutoAdvanceTimer(timer);
        } else {
          setScanStep("spool");
        }
      }
    } else if (needsAlternateSelection) {
      setScanStep("spool");
      setNeedsAlternateSelection(false);
      
      if (verificationMode === "auto") {
        const timer = setTimeout(() => {
          inputRef.current?.focus();
        }, 100);
        setAutoAdvanceTimer(timer);
      }
    } else if (scanStep === "spool") {
      // STEP 2: MPN/INTERNAL ID INPUT (Optional in both modes)
      if (val) {
        setInternalIdInput(val.trim().toUpperCase());
        setCaseConverted(caseConverted || val !== val.trim().toUpperCase());
      }
      setScanInput("");

      const matchingItem = bomDetail?.items.find(item => item.id === selectedItemIdForScan);
      const duration = feederScanTime ? Date.now() - feederScanTime : undefined;

      if (verificationMode === "manual") {
        // Manual mode: show pending verification, wait for VERIFY button click
        setPendingVerification({
          feederNumber: pendingFeeder,
          mpnOrInternalId: internalIdInput || val.trim().toUpperCase() || null,
          internalIdType,
          verificationMode: "manual",
          selectedItemId: selectedItemIdForScan || undefined,
          partNumber: matchingItem?.partNumber,
          duration,
        });
      } else {
        // AUTO mode: immediately submit
        handleAutoModeSubmit(val.trim().toUpperCase(), duration);
      }
    }
  };

  // New helper for auto-mode submission
  const handleAutoModeSubmit = async (mpnScanned: string, duration?: number) => {
    if (verificationInProgress) return;
    setVerificationInProgress(true);

    try {
      const res = await scanFeeder.mutateAsync({
        sessionId,
        data: {
          feederNumber: pendingFeeder,
          mpnOrInternalId: mpnScanned || undefined,
          internalIdType,
          verificationMode: "auto",
          selectedItemId: selectedItemIdForScan || undefined,
        },
      });

      setLastScanResult({
        status: res.status as "ok" | "reject",
        feeder: pendingFeeder,
        msg: res.message + (duration ? ` (${formatDuration(duration)})` : ""),
      });

      if (res.status === "ok") {
        setScanInput("");
        setPendingFeeder("");
        setFeederScanTime(null);
        setScanStep("feeder");
        setPendingAvailableOptions(null);
        setSelectedItemIdForScan(null);
        setInternalIdInput("");
        setCaseConverted(false);
        setIsDuplicate(false);
        setLastVerificationTime(Date.now());
        queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(sessionId) });
        
        setTimeout(() => {
          inputRef.current?.focus();
        }, 100);
      } else {
        setScanInput("");
      }
    } catch (err: any) {
      setLastScanResult({
        status: "reject",
        feeder: pendingFeeder,
        msg: err?.message || "Verification failed",
      });
    } finally {
      setVerificationInProgress(false);
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

  const getScanStepLabel = () => {
    if (needsAlternateSelection) {
      return `SELECT COMPONENT for ${pendingFeeder} — Click primary or alternate, then press ENTER`;
    }
    if (scanStep === "feeder") {
      return verificationMode === "auto" 
        ? "STEP 1 — Scan FEEDER NUMBER (Auto-Advance)" 
        : "STEP 1 / 2 — Scan FEEDER NUMBER";
    }
    const stepLabel = verificationMode === "auto" 
      ? "STEP 2 (Auto-Submit)" 
      : "STEP 2 / 3";
    return `${stepLabel} — Scan MPN / INTERNAL ID or press ENTER to skip (Feeder: ${pendingFeeder})`;
  };

  return (
    <div id="scan-flash-bg" className="h-[100dvh] w-full flex flex-col transition-colors duration-1000 bg-background overflow-hidden">
      {/* Header - Responsive */}
      <header className="bg-card border-b border-border p-2 sm:p-3 lg:p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4 shrink-0 shadow-sm z-10 relative">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <img src="/ucal-logo.svg" alt="UCAL Electronics" className="h-8 sm:h-10" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-2 sm:gap-x-4 lg:gap-x-8 gap-y-1 sm:gap-y-2 text-xs sm:text-sm min-w-0">
            <div className="truncate"><span className="text-muted-foreground font-medium text-xs">PANEL:</span> <span className="font-bold text-primary ml-1 truncate block">{session.panelName}</span></div>
            <div className="truncate"><span className="text-muted-foreground font-medium text-xs">BOM:</span> <span className="font-bold ml-1 truncate block">{session.bomName || session.bomId}</span></div>
            <div className="hidden sm:block truncate"><span className="text-muted-foreground font-medium text-xs">OP:</span> <span className="font-bold ml-1 truncate block">{session.operatorName}</span></div>
            <div className="hidden lg:block truncate"><span className="text-muted-foreground font-medium text-xs">SHIFT:</span> <span className="font-bold ml-1 truncate block">{session.shiftName}</span></div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 ml-auto sm:ml-0 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center gap-2">
            {session?.bomId === 0 && (
              <div className="px-2 py-1 sm:px-3 sm:py-1.5 bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-sm text-xs sm:text-sm font-bold text-amber-800 dark:text-amber-400">
                FREE SCAN
              </div>
            )}
          </div>
          <div className="text-right flex flex-col items-end">
            <div className="text-muted-foreground text-xs font-bold tracking-wider">TIME</div>
            <div className="text-lg sm:text-2xl font-mono font-black tracking-widest">{formatElapsed(elapsed)}</div>
          </div>
          {session.status === "active" ? (
            <div className="flex gap-1 sm:gap-2 flex-col-reverse sm:flex-row">
              <Button variant="destructive" className="font-bold tracking-widest text-xs sm:text-sm py-1 sm:py-2 px-2 sm:px-4 h-auto" onClick={handleEndSession}>
                END
              </Button>
              <Button
                variant="outline"
                className="font-bold tracking-widest border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground text-xs sm:text-sm py-1 sm:py-2 px-2 sm:px-3 h-auto"
                onClick={handleCancelSession}
              >
                <X className="w-3 h-3 sm:w-4 sm:h-4" />
              </Button>
            </div>
          ) : (
            <Button asChild className="font-bold tracking-widest text-xs sm:text-sm py-1 sm:py-2 px-2 sm:px-4 h-auto">
              <Link href={`/session/${session.id}/report`}>REPORT</Link>
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Main Panel */}
        <div className="flex-1 flex flex-col p-3 sm:p-4 lg:p-6 gap-3 sm:gap-4 lg:gap-6 overflow-y-auto border-b lg:border-b-0 lg:border-r border-border bg-background/50">

          {session.status === "active" && (
            <>
              {/* Mode Tabs - Responsive */}
              <div className="flex gap-1.5 sm:gap-2 lg:gap-3">
                <Button
                  variant={mode === "scan" ? "default" : "outline"}
                  className="flex-1 h-8 sm:h-10 lg:h-12 font-bold tracking-wider text-xs sm:text-sm lg:text-base"
                  onClick={() => { setMode("scan"); setScanStep("feeder"); setScanInput(""); }}
                >
                  <ScanLine className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5 mr-0.5 sm:mr-1 lg:mr-2" /> <span className="hidden sm:inline">SCAN</span><span className="sm:hidden">S</span>
                </Button>
                <Button
                  variant={mode === "splice" ? "default" : "outline"}
                  className={`flex-1 h-8 sm:h-10 lg:h-12 font-bold tracking-wider text-xs sm:text-sm lg:text-base ${mode === "splice" ? "bg-amber-500 hover:bg-amber-600 border-amber-500" : "border-amber-500 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950"}`}
                  onClick={() => { setMode("splice"); setSpliceStep("feeder"); setSpliceInput(""); }}
                >
                  <Scissors className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5 mr-0.5 sm:mr-1 lg:mr-2" /> <span className="hidden sm:inline">SPLICE</span><span className="sm:hidden">SP</span>
                </Button>
              </div>

              {/* Verification Mode Toggle */}
              {mode === "scan" && (
                <div className="flex gap-1.5 sm:gap-2 lg:gap-3 bg-slate-100 dark:bg-slate-900 p-1.5 sm:p-2 lg:p-3 rounded-lg">
                  <Button
                    type="button"
                    variant={verificationMode === "manual" ? "default" : "outline"}
                    className="flex-1 h-7 sm:h-9 lg:h-10 font-semibold text-xs sm:text-sm lg:text-base"
                    onClick={() => setVerificationMode("manual")}
                    disabled={verificationInProgress}
                  >
                    <span className="hidden sm:inline">⬜ MANUAL</span><span className="sm:hidden">⬜ Man</span>
                  </Button>
                  <Button
                    type="button"
                    variant={verificationMode === "auto" ? "default" : "outline"}
                    className="flex-1 h-7 sm:h-9 lg:h-10 font-semibold text-xs sm:text-sm lg:text-base bg-green-600 hover:bg-green-700 border-green-600"
                    onClick={() => setVerificationMode("auto")}
                    disabled={verificationInProgress}
                  >
                    <span className="hidden sm:inline">⚡ AUTO</span><span className="sm:hidden">⚡ Auto</span>
                  </Button>
                </div>
              )}

              {/* Pending Verification Alert */}
              {pendingVerification && verificationMode === "manual" && (
                <div className="bg-blue-50 dark:bg-blue-950 border-2 border-blue-400 p-3 sm:p-4 rounded-lg space-y-3">
                  <div className="text-sm font-semibold text-blue-900 dark:text-blue-100">⏳ MANUAL VERIFICATION PENDING</div>
                  
                  {/* Feeder Info */}
                  <div className="bg-white dark:bg-blue-900/20 p-2 rounded border border-blue-200 dark:border-blue-700">
                    <p className="text-xs text-blue-600 dark:text-blue-300 font-bold">FEEDER NUMBER:</p>
                    <p className="text-sm sm:text-base font-mono font-bold text-blue-900 dark:text-blue-100">
                      {pendingVerification.feederNumber}
                      {caseConverted && <span className="text-orange-600 dark:text-orange-400 text-xs ml-2">(AUTO-UPPERCASE)</span>}
                    </p>
                    {pendingVerification.partNumber && (
                      <p className="text-xs text-blue-700 dark:text-blue-200 mt-1">Part: {pendingVerification.partNumber}</p>
                    )}
                  </div>

                  {/* MPN / Internal ID Info */}
                  {pendingVerification.mpnOrInternalId && (
                    <div className="bg-white dark:bg-blue-900/20 p-2 rounded border border-blue-200 dark:border-blue-700">
                      <p className="text-xs text-blue-600 dark:text-blue-300 font-bold">
                        {pendingVerification.internalIdType === "mpn" ? "MPN / PART NUMBER" : "INTERNAL ID"}:
                      </p>
                      <p className="text-sm sm:text-base font-mono font-bold text-blue-900 dark:text-blue-100">
                        {pendingVerification.mpnOrInternalId}
                        {pendingVerification.caseConverted && <span className="text-orange-600 dark:text-orange-400 text-xs ml-2">(AUTO-UPPERCASE)</span>}
                      </p>
                    </div>
                  )}

                  <Button
                    className="w-full bg-green-500 hover:bg-green-600 font-bold text-white"
                    onClick={() => handleVerifyPendingScan()}
                    disabled={verificationLocked || verificationInProgress}
                  >
                    ✓ VERIFY & CONFIRM ENTRY
                  </Button>
                </div>
              )}

              {/* SCAN MODE - Responsive */}
              {mode === "scan" && (
                <div className="bg-card border-2 border-primary/50 p-2 sm:p-4 lg:p-8 rounded-xl shadow-[0_0_20px_rgba(var(--primary),0.1)]">
                  <form onSubmit={handleScanSubmit} className="flex flex-col items-center gap-2 sm:gap-3 lg:gap-6">
                    <Label className="text-xs sm:text-sm lg:text-lg xl:text-xl tracking-widest text-primary flex items-center gap-1 sm:gap-2 font-black uppercase text-center line-clamp-2">
                      <ScanLine className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5 xl:w-6 xl:h-6 flex-shrink-0" />
                      {getScanStepLabel()}
                    </Label>
                    
                    {/* Alternate Selector */}
                    {needsAlternateSelection && pendingAvailableOptions && (
                      <div className="w-full max-w-lg">
                        <AlternateSelector
                          feederNumber={pendingFeeder}
                          primaryOptions={pendingAvailableOptions.primary}
                          alternateOptions={pendingAvailableOptions.alternates}
                          selectedId={selectedItemIdForScan || undefined}
                          onSelect={setSelectedItemIdForScan}
                          isLoading={scanFeeder.isPending}
                        />
                      </div>
                    )}

                    <div className="w-full flex gap-0.5 sm:gap-1 lg:gap-2 items-center justify-center min-h-12 sm:min-h-14 lg:min-h-16">
                      {scanStep === "spool" && !needsAlternateSelection && !pendingVerification && (
                        <Button type="button" variant="ghost" size="icon" className="shrink-0 h-10 sm:h-12 lg:h-14 xl:h-16 w-10 sm:w-12 lg:w-14 xl:w-16" onClick={() => { setScanStep("feeder"); setPendingFeeder(""); setFeederScanTime(null); setScanInput(""); setNeedsAlternateSelection(false); setPendingAvailableOptions(null); setSelectedItemIdForScan(null); setInternalIdInput(""); setCaseConverted(false); }}>
                          <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5 xl:w-6 xl:h-6" />
                        </Button>
                      )}
                      {needsAlternateSelection && (
                        <Button type="button" variant="ghost" size="icon" className="shrink-0 h-10 sm:h-12 lg:h-14 xl:h-16 w-10 sm:w-12 lg:w-14 xl:w-16" onClick={() => { setScanStep("feeder"); setPendingFeeder(""); setFeederScanTime(null); setScanInput(""); setNeedsAlternateSelection(false); setPendingAvailableOptions(null); setSelectedItemIdForScan(null); setInternalIdInput(""); setCaseConverted(false); }}>
                          <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5 xl:w-6 xl:h-6" />
                        </Button>
                      )}
                      {!pendingVerification && (
                        <Input
                          ref={inputRef}
                          value={scanInput}
                          onChange={(e) => setScanInput(e.target.value)}
                          className="flex-1 text-center text-lg sm:text-2xl lg:text-3xl xl:text-4xl h-10 sm:h-12 lg:h-16 xl:h-20 font-mono tracking-[0.15em] sm:tracking-[0.2em] bg-background border-2 border-border focus-visible:border-primary rounded-lg shadow-inner text-xs sm:text-sm"
                          placeholder={needsAlternateSelection ? "Press ENTER..." : (scanStep === "feeder" ? "SCAN FEEDER..." : verificationMode === "auto" ? "SCAN MPN/ID" : "SCAN MPN/ID...")}
                          autoFocus
                          autoComplete="off"
                        />
                      )}
                    </div>
                    {scanStep === "spool" && !needsAlternateSelection && !pendingVerification && (
                      <div className="w-full space-y-1 sm:space-y-2">
                        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 p-1.5 sm:p-2 lg:p-3 rounded text-center">
                          <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">Feeder <strong className="text-foreground font-mono">{pendingFeeder}</strong> selected</p>
                        </div>
                        
                        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 p-2 sm:p-3 rounded-lg">
                          <p className="text-xs font-bold text-blue-900 dark:text-blue-100 mb-2">📝 STEP 2: MPN/INTERNAL ID</p>
                          <p className="text-xs text-blue-800 dark:text-blue-200">
                            • Scan the MPN or Internal ID for verification
                          </p>
                          <p className="text-xs text-blue-800 dark:text-blue-200">
                            • Press <strong>ENTER</strong> to skip verification
                          </p>
                          <p className="text-xs text-blue-700 dark:text-blue-300 mt-2 italic">
                            ⓘ Required MPN/Internal ID is enforced in both AUTO and MANUAL modes
                          </p>
                        </div>
                      </div>
                    )}
                  </form>
                </div>
              )}

              {/* SPLICE MODE - Responsive */}
              {mode === "splice" && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-400 p-2 sm:p-4 lg:p-8 rounded-xl">
                  <form onSubmit={handleSpliceSubmit} className="flex flex-col items-center gap-2 sm:gap-3 lg:gap-6">
                    <Label className="text-xs sm:text-sm lg:text-base xl:text-lg tracking-widest text-amber-600 dark:text-amber-400 flex items-center gap-1 sm:gap-2 font-black uppercase text-center line-clamp-2">
                      <Scissors className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5 xl:w-6 xl:h-6 flex-shrink-0" />
                      {spliceStepLabels[spliceStep]}
                    </Label>
                    <Input
                      ref={inputRef}
                      value={spliceInput}
                      onChange={(e) => setSpliceInput(e.target.value)}
                      className="w-full max-w-2xl text-center text-lg sm:text-2xl lg:text-3xl xl:text-4xl h-10 sm:h-12 lg:h-16 xl:h-20 font-mono tracking-[0.15em] sm:tracking-[0.2em] bg-background border-2 border-amber-300 focus-visible:border-amber-500 rounded-lg shadow-inner text-xs sm:text-sm"
                      placeholder={
                        spliceStep === "feeder" ? "SCAN NO..." :
                        spliceStep === "oldSpool" ? "SCAN OLD..." :
                        "SCAN NEW..."
                      }
                      autoFocus
                      autoComplete="off"
                    />
                    {spliceStep !== "feeder" && spliceStartTime && (
                      <p className="text-xs sm:text-sm text-amber-700 dark:text-amber-400 font-bold">
                        ⏱️ {Math.round((Date.now() - spliceStartTime) / 1000)}s
                      </p>
                    )}
                    <Button type="button" variant="ghost" className="text-muted-foreground text-xs sm:text-sm" onClick={cancelSplice}>
                      Cancel
                    </Button>
                  </form>
                </div>
              )}
            </>
          )}

          {/* Feedback Area - Responsive */}
          <div className="h-20 sm:h-24 lg:h-32 xl:h-40 flex items-center justify-center shrink-0">
            {lastScanResult ? (
              <div className={`w-full h-full flex flex-col items-center justify-center rounded-xl border-2 shadow-lg transition-all gap-1 sm:gap-2 p-2 sm:p-3 lg:p-4 ${
                lastScanResult.status === "ok" ? "bg-green-50 dark:bg-green-950/30 border-green-500 text-green-700 dark:text-green-300" :
                lastScanResult.status === "splice" ? "bg-amber-50 dark:bg-amber-950/30 border-amber-400 text-amber-600 dark:text-amber-400" :
                lastScanResult.msg?.includes("ALREADY") || lastScanResult.msg?.includes("DUPLICATE") ? 
                  "bg-orange-50 dark:bg-orange-950/30 border-orange-400 text-orange-700 dark:text-orange-300" :
                "bg-red-50 dark:bg-red-950/30 border-red-500 text-red-700 dark:text-red-300"
              }`}>
                <div className="flex items-center gap-1 sm:gap-2 lg:gap-3">
                  {lastScanResult.status === "ok" && <CheckCircle2 className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10" />}
                  {lastScanResult.status === "splice" && <Scissors className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10" />}
                  {lastScanResult.status === "reject" && (
                    lastScanResult.msg?.includes("ALREADY") || lastScanResult.msg?.includes("DUPLICATE") ?
                    <AlertCircle className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10" /> :
                    <XCircle className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10" />
                  )}
                  <div className="text-lg sm:text-2xl lg:text-3xl xl:text-4xl font-black tracking-widest uppercase">
                    {lastScanResult.status === "splice" ? "SPLICED" :
                     lastScanResult.status === "ok" ? "PASS ✓" :
                     lastScanResult.msg?.includes("ALREADY") || lastScanResult.msg?.includes("DUPLICATE") ?
                     "⚠️ DUPLICATE" : "FAIL ✗"}
                  </div>
                </div>
                <div className="text-xs sm:text-sm lg:text-base font-bold tracking-wide text-center px-2 line-clamp-2">
                  {lastScanResult.msg}
                </div>
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center border-2 border-dashed border-border rounded-xl text-muted-foreground font-medium text-xs sm:text-sm lg:text-lg bg-card/50">
                Ready — scan to begin
              </div>
            )}
          </div>

          {/* Scan History - Responsive */}
          <Card className="flex-1 flex flex-col overflow-hidden border-border shadow-sm">
            <CardHeader className="bg-secondary/30 py-2 px-3 sm:py-3 sm:px-4 border-b border-border">
              <div className="flex justify-between items-center gap-2">
                <CardTitle className="text-xs sm:text-sm font-bold tracking-wider uppercase text-muted-foreground">Log</CardTitle>
                <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm font-bold">
                  <span className="text-primary">{session.scans.length}</span>
                  <span className="text-amber-500">{splices?.length ?? 0}S</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden">
              <ScrollArea className="h-full w-full">
                <div className="p-2 sm:p-3 space-y-1 sm:space-y-2">
                  {/* Splice records first (inline, amber) */}
                  {splices && splices.length > 0 && splices.map((sp) => (
                    <div key={`splice-${sp.id}`} className="flex items-center justify-between p-2 sm:p-3 border rounded-md font-mono text-xs shadow-sm bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                      <div className="flex items-center gap-2 min-w-0">
                        <Scissors className="w-3 h-3 text-amber-600 shrink-0" />
                        <span className="font-bold text-amber-700 dark:text-amber-400 w-10 truncate">SPLICD</span>
                        <span className="font-bold text-sm truncate">{sp.feederNumber}</span>
                        <span className="text-muted-foreground text-xs hidden sm:inline truncate">{sp.oldSpoolBarcode?.substring(0, 8)}... → {sp.newSpoolBarcode?.substring(0, 8)}...</span>
                        {sp.durationSeconds != null && <span className="text-muted-foreground text-xs hidden sm:inline">{sp.durationSeconds}s</span>}
                      </div>
                      <div className="text-muted-foreground text-xs font-medium shrink-0 ml-2">
                        {format(new Date(sp.splicedAt), "HH:mm")}
                      </div>
                    </div>
                  ))}
                  {[...session.scans].reverse().map((scan) => (
                    <div key={scan.id} className={`flex items-center justify-between p-2 sm:p-3 border rounded-md font-mono text-xs shadow-sm transition-colors ${
                      scan.status === "ok" ? "bg-success/5 border-success/20 text-foreground" : "bg-destructive/5 border-destructive/20 text-foreground"
                    }`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`font-black uppercase tracking-wider w-10 ${scan.status === "ok" ? "text-success" : "text-destructive"}`}>
                          {scan.status === "ok" ? "OK" : "REJ"}
                        </span>
                        <span className="font-bold truncate">{scan.feederNumber}</span>
                        {(scan as any).spoolBarcode && <span className="text-muted-foreground text-xs hidden sm:inline truncate">{(scan as any).spoolBarcode?.substring(0, 8)}...</span>}
                      </div>
                      <div className="text-muted-foreground text-xs font-medium">
                        {format(new Date(scan.scannedAt), "HH:mm")}
                      </div>
                    </div>
                  ))}
                  {session.scans.length === 0 && !splices?.length && (
                    <div className="h-20 flex items-center justify-center text-muted-foreground text-xs font-medium">
                      No scans
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel: BOM Checklist - Hidden on mobile, shown on lg, hidden if free scan mode */}
        {session?.bomId !== 0 && (
          <div className="hidden lg:flex w-96 flex-col bg-card shrink-0 shadow-[-4px_0_15px_-5px_rgba(0,0,0,0.1)] z-10 border-l border-border">
            <div className="p-3 sm:p-4 border-b border-border bg-secondary/30 flex justify-between items-center gap-2">
            <h2 className="font-bold tracking-wider uppercase text-sm">BOM</h2>
            <div className="text-xs font-bold bg-background px-2 py-1 rounded-full border border-border shadow-sm">
              <span className="text-success">{uniqueOkScans}</span> / {totalBomItems}
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 sm:p-3 space-y-1 sm:space-y-2">
              {bomDetail?.items.map((item) => {
                const status = feederStatusMap[item.feederNumber];
                const hasSplice = splices?.some((sp) => sp.feederNumber === item.feederNumber);
                const canRescan = session.status === "active" && (status === "reject" || status === "pending");
                return (
                  <div key={item.id} className={`flex items-center justify-between p-2 sm:p-3 rounded-lg border shadow-sm transition-colors text-sm ${
                    status === "ok" ? "bg-success/5 border-success/30" :
                    status === "reject" ? "bg-destructive/5 border-destructive/30" :
                    "bg-background border-border"
                  }`}>
                    <div className="flex flex-col min-w-0 flex-1 gap-1">
                      {/* Row 1: Feeder Number & Part Number */}
                      <div className="flex items-center gap-1 sm:gap-2">
                        <span className="font-bold font-mono text-xs sm:text-sm truncate">{item.feederNumber}</span>
                        {hasSplice && <Scissors className="w-3 h-3 text-amber-500 shrink-0" />}
                      </div>
                      <span className="text-xs text-muted-foreground truncate font-medium">{item.partNumber}</span>
                      
                      {/* Row 2: Expected MPN (if exists) */}
                      {item.expectedMpn && (
                        <div className="text-xs text-muted-foreground font-mono">
                          <span className="font-bold text-foreground">MPN:</span> {item.expectedMpn}
                        </div>
                      )}
                      
                      {/* Row 3: Internal ID (if exists) */}
                      {item.internalId && (
                        <div className="text-xs text-muted-foreground font-mono">
                          <span className="font-bold text-foreground">ID:</span> {item.internalId}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 ml-2 flex items-center gap-1 sm:gap-2">
                      {canRescan && (
                        <button
                          title="Re-scan"
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
                          <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4" />
                        </button>
                      )}
                      {status === "ok" && <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-success shrink-0" />}
                      {status === "reject" && <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-destructive shrink-0" />}
                      {status === "pending" && <Circle className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground/30 shrink-0" />}
                    </div>
                  </div>
                );
              })}
              {!bomDetail?.items.length && (
                <div className="p-8 text-center text-xs text-muted-foreground font-medium border border-dashed border-border rounded-lg mt-4">
                  No items in BOM.
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Splice summary */}
          {(splices?.length ?? 0) > 0 && (
            <div className="p-3 border-t border-border bg-amber-50/50 dark:bg-amber-950/20">
              <div className="text-xs font-bold text-amber-600 dark:text-amber-400 tracking-wider mb-2 flex items-center gap-1">
                <Scissors className="w-3 h-3" /> {splices?.length} SPLICES
              </div>
              <div className="space-y-1">
                {splices?.map((sp) => (
                  <div key={sp.id} className="text-xs text-muted-foreground font-mono flex justify-between px-1">
                    <span>{sp.feederNumber}</span>
                    <span>{sp.durationSeconds != null ? `${sp.durationSeconds}s` : format(new Date(sp.splicedAt), "HH:mm")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progress bar */}
          <div className="p-3 sm:p-4 border-t border-border bg-background">
            <div className="flex justify-between text-xs font-bold mb-2 tracking-wider text-muted-foreground">
              <span>PROGRESS</span>
              <span className="text-foreground">{totalBomItems > 0 ? Math.round((uniqueOkScans / totalBomItems) * 100) : 0}%</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden shadow-inner">
              <div
                className="h-full bg-primary transition-all duration-500 ease-out"
                style={{ width: `${totalBomItems > 0 ? (uniqueOkScans / totalBomItems) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
          )}
      </div>

      {/* Notification Alert Dialog */}
      <AlertDialog open={showNotification} onOpenChange={setShowNotification}>
        <AlertDialogContent 
          className="sm:max-w-md"
          onKeyDown={(e: React.KeyboardEvent) => {
            // Dismiss on any key press (Enter, Space, Escape, or any character)
            if (!e.ctrlKey && !e.altKey && !e.metaKey) {
              e.preventDefault();
              setShowNotification(false);
            }
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {notificationType === "duplicate" && <AlertCircle className="w-5 h-5 text-orange-600" />}
              {notificationType === "error" && <AlertCircle className="w-5 h-5 text-red-600" />}
              {notificationType === "warning" && <AlertCircle className="w-5 h-5 text-yellow-600" />}
              {notificationType === "duplicate" ? "⚠️ DUPLICATE" : notificationType === "error" ? "❌ ERROR" : "⚡ WARNING"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm sm:text-base font-mono mt-4">
              {notificationMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogAction 
              onClick={() => setShowNotification(false)}
              autoFocus
              className={`w-full font-bold text-lg sm:text-xl py-6 ${
                notificationType === "duplicate" ? "bg-orange-600 hover:bg-orange-700" : 
                notificationType === "error" ? "bg-red-600 hover:bg-red-700" : 
                "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              ✓ OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
