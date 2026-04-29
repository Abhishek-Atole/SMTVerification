// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Circle, Scissors, TriangleAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useScanner } from "@/hooks/useScanner";
import { useAutoScan } from "@/hooks/useAutoScan";
import { useNotification } from "@/hooks/use-notification";
import { ScanNotification } from "@/components/notifications/ScanNotification";
import { LogPanel } from "@/components/LogPanel";
import { AppLogo } from "@/components/AppLogo";
import { appConfig } from "@/lib/appConfig";
import { useAuth } from "@/context/auth-context";
import { BOM_DATA } from "@/data/bom";
import { useIsVerificationComplete, useVerificationStore } from "@/store/useVerificationStore";
import { useSession } from "@/context/session-context";
import { getListSplicesQueryKey, useListSplices, useRecordSplice } from "@workspace/api-client-react";
import { buildCandidates, normalizeMpn } from "@/utils/mpnUtils";

type Step = "feeder" | "mpn" | "lot";
type SpliceStatus = "verified" | "alternate";

type PseudoBomItem = {
  feederNumber: string;
  mpn1?: string | null;
  mpn2?: string | null;
  mpn3?: string | null;
  internalPartNumber?: string | null;
  make1?: string | null;
  make2?: string | null;
  make3?: string | null;
};

type PendingSplice = {
  feederNumber: string;
  scannedValue: string;
  matchedAs: string;
  matchedField: "mpn1" | "mpn2" | "mpn3" | "internalPartNumber";
  status: SpliceStatus;
  operatorId: number;
};

type SpliceLogEntry = PendingSplice & {
  lotCode: string | null;
  verificationMode: "AUTO" | "MANUAL";
  splicedAt: Date;
};

type RemoteSpliceRecord = SpliceLogEntry & {
  id: number;
  sessionId: number;
  bomItem?: PseudoBomItem | null;
  expectedMpns?: string[];
  scannedValue?: string;
  matchedAs?: string;
  matchedField?: string | null;
  lotCode?: string | null;
  status?: SpliceStatus | "failed";
  verificationMode?: "AUTO" | "MANUAL";
};

function playBuzzer(type: "success" | "error" | "warning") {
  try {
    const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtor) return;
    const audioContext = new AudioCtor();
    const now = audioContext.currentTime;

    const beep = (frequency: number, start: number, duration: number, gainValue = 0.08) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(gainValue, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.start(start);
      osc.stop(start + duration);
    };

    if (type === "success") {
      beep(840, now, 0.09);
      beep(1180, now + 0.12, 0.11);
    } else if (type === "warning") {
      beep(620, now, 0.16);
    } else {
      beep(420, now, 0.09);
      beep(370, now + 0.14, 0.09);
      beep(320, now + 0.28, 0.11);
    }
  } catch (error) {
    console.warn("Unable to play buzzer", error);
  }
}

function toPseudoBomItem(entry: { feederId: string; alternatives: Array<{ mpn: string; partId: string; description: string }> }): PseudoBomItem {
  return {
    feederNumber: entry.feederId,
    mpn1: entry.alternatives[0]?.mpn ?? null,
    mpn2: entry.alternatives[1]?.mpn ?? null,
    mpn3: entry.alternatives[2]?.mpn ?? null,
    internalPartNumber: entry.alternatives.map((item) => item.partId).join(" "),
    make1: entry.alternatives[0]?.description ?? null,
    make2: entry.alternatives[1]?.description ?? null,
    make3: entry.alternatives[2]?.description ?? null,
  };
}

function resolveMatch(scanned: string, bomItem: PseudoBomItem) {
  const normalized = normalizeMpn(scanned);
  const found = buildCandidates(bomItem).find((candidate) => candidate.value === normalized);

  if (!found) {
    return null;
  }

  const matchedField =
    found.label === "MPN 1"
      ? "mpn1"
      : found.label === "MPN 2"
        ? "mpn2"
        : found.label === "MPN 3"
          ? "mpn3"
          : "internalPartNumber";

  return {
    match: true,
    label: found.label,
    make: found.make,
    isPrimary: found.isPrimary,
    matchedAs: `${found.label}${found.make ? ` (${found.make})` : ""}`,
    matchedField: matchedField as PendingSplice["matchedField"],
    status: found.isPrimary ? ("verified" as const) : ("alternate" as const),
  };
}

function normalizeRemoteSpliceRecord(record: RemoteSpliceRecord): RemoteSpliceRecord {
  return {
    ...record,
    feederNumber: String(record.feederNumber ?? ""),
    scannedValue: String(record.scannedValue ?? record.newSpoolBarcode ?? ""),
    matchedAs: String(record.matchedAs ?? ""),
    matchedField: (record.matchedField ?? null) as RemoteSpliceRecord["matchedField"],
    lotCode: record.lotCode ?? null,
    status: (record.status ?? "failed") as RemoteSpliceRecord["status"],
    verificationMode: record.verificationMode ?? "AUTO",
    splicedAt: new Date(record.splicedAt),
  };
}

export default function SplicingPage() {
  const [, setLocation] = useLocation();
  const isVerificationComplete = useIsVerificationComplete();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { activeSession, loading: sessionLoading } = useSession();
  const bomEntries = useVerificationStore((state) => state.bomEntries);
  const scannedFeeders = useVerificationStore((state) => state.scannedFeeders);
  const catalog = bomEntries.length > 0 ? bomEntries : BOM_DATA;
  const sessionId = Number(activeSession?.id ?? 0);

  const spliceQuery = useListSplices(sessionId);
  const recordSpliceMutation = useRecordSplice();

  const [step, setStep] = useState<Step>("feeder");
  const [feederNumber, setFeederNumber] = useState("");
  const [lockedBomItem, setLockedBomItem] = useState<PseudoBomItem | null>(null);
  const [pendingSplice, setPendingSplice] = useState<PendingSplice | null>(null);

  const {
    notifications,
    dismissNotification,
    showErrorAlert,
    showSuccessAlert,
    showWarningAlert,
  } = useNotification();

  useEffect(() => {
    if (!isVerificationComplete) {
      setLocation("/verification");
    }
  }, [isVerificationComplete, setLocation]);

  useEffect(() => {
    if (!sessionLoading && !activeSession) {
      setLocation("/verification");
    }
  }, [activeSession, sessionLoading, setLocation]);

  useEffect(() => {
    document.title = `${appConfig.companyShort} | Splicing`;
  }, []);

  const currentLabel = useMemo(() => {
    if (step === "feeder") return "STEP 1 / 3 - Scan FEEDER NUMBER";
    if (step === "mpn") return `STEP 2 / 3 - Scan NEW SPOOL MPN for ${feederNumber}`;
    return `STEP 3 / 3 - Enter LOT CODE (Enter = skip) for ${feederNumber}`;
  }, [step, feederNumber]);

  const lockedCandidates = useMemo(() => {
    return lockedBomItem ? buildCandidates(lockedBomItem) : [];
  }, [lockedBomItem]);

  const expectedMpns = useMemo(() => {
    if (!lockedBomItem) return [] as string[];
    return buildCandidates(lockedBomItem).map((candidate) => candidate.value).filter(Boolean);
  }, [lockedBomItem]);

  const previousVerificationTime = useMemo(() => {
    return scannedFeeders.get(feederNumber.toUpperCase())?.scannedAt ?? null;
  }, [feederNumber, scannedFeeders]);

  const records = useMemo(() => {
    return (spliceQuery.data ?? []).map((record) => normalizeRemoteSpliceRecord(record as RemoteSpliceRecord));
  }, [spliceQuery.data]);

  const handleLotKeyDown = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (step !== "lot" || event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    await finalizeSplice(value.trim().toUpperCase() || null);
  };

  const resetFlow = () => {
    setStep("feeder");
    setFeederNumber("");
    setLockedBomItem(null);
    setPendingSplice(null);
    reset();
  };

  const finalizeSplice = async (nextLotCode: string | null) => {
    if (!pendingSplice || !lockedBomItem || !sessionId) {
      playBuzzer("error");
      showErrorAlert("No locked feeder is ready to splice.", "high");
      return;
    }

    try {
      const response = await recordSpliceMutation.mutateAsync({
        sessionId,
        data: {
          feederNumber: pendingSplice.feederNumber,
          scannedValue: pendingSplice.scannedValue,
          matchedAs: pendingSplice.matchedAs,
          matchedField: pendingSplice.matchedField,
          lotCode: nextLotCode,
          status: pendingSplice.status,
          verificationMode: "AUTO",
          splicedAt: new Date().toISOString(),
          operatorId: pendingSplice.operatorId,
        } as any,
      });

      const normalizedRecord = normalizeRemoteSpliceRecord((response ?? {}) as RemoteSpliceRecord);
      queryClient.setQueryData(getListSplicesQueryKey(sessionId), (current: unknown) => {
        const currentList = Array.isArray(current) ? (current as RemoteSpliceRecord[]) : [];
        return [normalizedRecord, ...currentList];
      });

      playBuzzer("success");
      showSuccessAlert(
        normalizedRecord.status === "verified"
          ? `✓ Splice Approved — ${normalizedRecord.matchedAs}`
          : `⚠ Splice Approved — Alternate ${normalizedRecord.matchedAs}`,
        "medium",
      );
      resetFlow();
    } catch (error) {
      playBuzzer("error");
      showErrorAlert(error instanceof Error ? error.message : "Failed to save splice.", "high");
    }
  };

  const onScan = async (raw: string) => {
    const value = raw.trim().toUpperCase();
    if (!value) return;

    if (step === "feeder") {
      const bomEntry = catalog.find((entry) => entry.feederId.toUpperCase() === value);
      if (!bomEntry) {
        playBuzzer("error");
        showErrorAlert(`Feeder ${value} was not found in the BOM.`, "high");
        reset();
        return;
      }

      const pseudoBomItem = toPseudoBomItem(bomEntry);
      setFeederNumber(value);
      setLockedBomItem(pseudoBomItem);
      setStep("mpn");
      reset();

      if (scannedFeeders.has(value)) {
        playBuzzer("success");
        showSuccessAlert(`Feeder ${value} locked for splicing.`, "medium");
      } else {
        playBuzzer("warning");
        showWarningAlert(`Feeder ${value} has not been verified yet. Proceeding with splice warning.`, "medium");
      }

      return;
    }

    if (step === "mpn") {
      if (!lockedBomItem) {
        playBuzzer("error");
        showErrorAlert("No feeder is locked. Scan a feeder first.", "high");
        return;
      }

      const match = resolveMatch(value, lockedBomItem);
      if (!match) {
        playBuzzer("error");
        showErrorAlert(`Wrong part. Expected: ${expectedMpns.join(" / ") || "No MPNs configured"}`, "high");
        reset();
        return;
      }

      setPendingSplice({
        feederNumber,
        scannedValue: value,
        matchedAs: match.matchedAs,
        matchedField: match.matchedField,
        status: match.status,
        operatorId: user?.userId ?? 0,
      });
      setStep("lot");
      reset();

      if (match.status === "verified") {
        playBuzzer("success");
        showSuccessAlert(`✓ Splice Approved — ${match.matchedAs}`);
      } else {
        playBuzzer("warning");
        showWarningAlert(`⚠ Splice Approved — Alternate ${match.matchedAs}`);
      }

      return;
    }

    if (step === "lot") {
      await finalizeSplice(value || null);
    }
  };

  const { inputRef, value, setValue, reset } = useScanner({
    onSubmit: onScan,
    autoFocus: true,
    resetAfterMs: 10000,
  });

  useAutoScan(value, {
    onScan,
    delayMs: 300,
    minLength: 1,
    enabled: step !== "lot",
  });

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 app-noise">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <AppLogo className="h-10 w-10 shrink-0" />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold">Splicing Station</h1>
              <p className="truncate text-xs text-muted-foreground">{appConfig.systemTitle}</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => setLocation("/verification")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back To Verification
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <Card className="panel-pop scan-surface">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Scissors className="h-5 w-5" /> Splicing Workflow
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold uppercase tracking-wider">
                  <div className={`rounded border px-3 py-2 ${step === "feeder" ? "border-amber-400 bg-amber-50 text-amber-700" : "border-border bg-muted/30 text-muted-foreground"}`}>1. Feeder</div>
                  <div className={`rounded border px-3 py-2 ${step === "mpn" ? "border-amber-400 bg-amber-50 text-amber-700" : "border-border bg-muted/30 text-muted-foreground"}`}>2. New Spool MPN</div>
                  <div className={`rounded border px-3 py-2 ${step === "lot" ? "border-amber-400 bg-amber-50 text-amber-700" : "border-border bg-muted/30 text-muted-foreground"}`}>3. Lot Code</div>
                </div>

                <Label className="text-sm font-semibold tracking-wide">{currentLabel}</Label>

                {lockedBomItem && (
                  <div className="rounded-2xl border border-amber-300 bg-amber-50/80 p-4 shadow-sm dark:border-amber-700 dark:bg-amber-950/30">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-base font-black text-amber-900 dark:text-amber-100">
                          <Scissors className="h-4 w-4 shrink-0" />
                          <span className="truncate">{feederNumber}</span>
                        </div>
                        <div className="mt-2 space-y-1 text-sm">
                          <div className="font-semibold text-foreground">Expected:</div>
                          <div className="font-mono text-xs text-muted-foreground">{expectedMpns.length > 0 ? expectedMpns.join(" / ") : "No MPNs configured"}</div>
                          <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                            {lockedCandidates.length > 0 ? (
                              lockedCandidates.map((candidate) => (
                                <div key={`${candidate.label}-${candidate.value}`}>
                                  {candidate.label}: {candidate.make || "-"}
                                </div>
                              ))
                            ) : (
                              <div>No makes configured.</div>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">Previously verified: {previousVerificationTime ? `✓ ${previousVerificationTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Not yet verified"}</div>
                        </div>
                      </div>
                      <div className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-bold text-amber-700 shadow-sm dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
                        {step === "feeder" ? "Waiting" : step === "mpn" ? "Locked" : "Ready to Save"}
                      </div>
                    </div>
                  </div>
                )}

                <Input
                  ref={inputRef}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={step === "lot" ? handleLotKeyDown : undefined}
                  placeholder={step === "feeder" ? "Scan feeder number" : step === "mpn" ? "Scan new spool MPN" : "Enter lot code or press Enter to skip"}
                  className="scan-input-surface h-14 text-center font-mono text-xl"
                  autoComplete="off"
                />

                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={resetFlow}>
                    Reset
                  </Button>
                  {step === "lot" && (
                    <Button type="button" className="flex-1" onClick={() => finalizeSplice(value.trim().toUpperCase() || null)}>
                      Save Lot
                    </Button>
                  )}
                  {step === "lot" && (
                    <Button type="button" variant="secondary" className="flex-1" onClick={() => finalizeSplice(null)}>
                      Skip Lot
                    </Button>
                  )}
                </div>

                <div className="rounded-lg border border-dashed border-border bg-background/60 p-3 text-xs text-muted-foreground">
                  Step 1 validates the feeder against the BOM. Step 2 requires the replacement spool to match MPN 1, 2, 3, or an internal ID token for that same feeder. Step 3 saves the lot code if provided.
                </div>
              </CardContent>
            </Card>

            <Card className="panel-pop scan-surface">
              <CardHeader>
                <CardTitle>Splice Log</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-6 gap-2 rounded bg-muted/40 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <div>Time</div>
                  <div>Feeder</div>
                  <div>Scanned MPN</div>
                  <div>Matched As</div>
                  <div>Lot</div>
                  <div>Status</div>
                </div>

                {records.length === 0 ? (
                  <div className="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No splices yet.</div>
                ) : (
                  records.map((row, idx) => (
                    <div key={`${row.id}-${idx}`} className="grid grid-cols-6 gap-2 rounded border p-2 text-sm">
                      <div className="font-mono text-xs text-muted-foreground">{row.splicedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
                      <div className="font-mono font-semibold">{row.feederNumber}</div>
                      <div className="font-mono truncate">{row.scannedValue}</div>
                      <div className="truncate text-xs">{row.matchedAs}</div>
                      <div className="font-mono truncate">{row.lotCode || "-"}</div>
                      <div>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${row.status === "verified" ? "bg-green-100 text-green-700" : row.status === "alternate" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                          {row.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="panel-pop scan-surface">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" /> Validation Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between rounded border p-2">
                  <span>Verification complete</span>
                  <span className={isVerificationComplete ? "text-green-600" : "text-amber-600"}>{isVerificationComplete ? "Yes" : "No"}</span>
                </div>
                <div className="flex items-center justify-between rounded border p-2">
                  <span>Known feeders</span>
                  <span>{bomEntries.length}</span>
                </div>
                <div className="flex items-center justify-between rounded border p-2">
                  <span>Splice records</span>
                  <span>{records.length}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="panel-pop scan-surface">
              <CardHeader>
                <CardTitle>Scan Guidance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground">
                <div className="flex items-start gap-2"><Circle className="mt-0.5 h-3.5 w-3.5 text-amber-500" /> Step 1 scans feeder and warns if it has not been verified yet.</div>
                <div className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-green-600" /> Step 2 approves only exact MPN 1, 2, 3 or internal ID tokens for the same feeder.</div>
                <div className="flex items-start gap-2"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 text-amber-500" /> Alternate parts are saved as alternate, and mismatches stay on the same step.</div>
                <div className="flex items-start gap-2"><XCircle className="mt-0.5 h-3.5 w-3.5 text-red-600" /> Step 3 can be skipped or saved with a lot code.</div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <ScanNotification notifications={notifications} onDismiss={dismissNotification} />
      <LogPanel />
    </div>
  );
}