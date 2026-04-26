import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNotification } from "@/hooks/use-notification";
import { appConfig } from "@/lib/appConfig";
import { ManualOverrideModal } from "./ManualOverrideModal";

interface ScanState {
  step: "FEEDER" | "MPN" | "LOT" | "COMPLETE";
  feederNumber: string | null;
  scannedMPN: string | null;
  lotCode: string | null;
  bomMatch: BomMatch | null;
  error: string | null;
}

interface BomMatch {
  feederNumber: string;
  internalPartNumber: string | null;
  mpn1: string | null;
  mpn2: string | null;
  mpn3: string | null;
  make1: string | null;
  make2: string | null;
  make3: string | null;
  description: string | null;
  packageDescription: string | null;
  matchedField?: "mpn1" | "mpn2" | "mpn3" | "internalPartNumber" | null;
  matchedMake?: string | null;
  isAlternate?: boolean;
}

interface ProgressInfo {
  verified: number;
  total: number;
  percent: number;
}

interface ScanLogRecord {
  id: number;
  feederNumber: string;
  scannedValue: string;
  matchedField: string | null;
  matchedMake: string | null;
  lotCode: string | null;
  status: string;
  verificationMode: string;
  scannedAt: string;
  approvedBy: string | null;
  bom: {
    mpn1: string | null;
    mpn2: string | null;
    mpn3: string | null;
  };
}

interface SpliceRecord {
  feederNumber: string;
  oldSpool: string;
  newSpool: string;
  timestamp: string;
}

interface FeederVerificationAutoProps {
  sessionId: string;
  onProgress?: (progress: ProgressInfo) => void;
}

export const FeederVerificationAuto: React.FC<FeederVerificationAutoProps> = ({
  sessionId,
  onProgress,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const [progress, setProgress] = useState<ProgressInfo>({ verified: 0, total: 0, percent: 0 });
  const [scanLog, setScanLog] = useState<ScanLogRecord[]>([]);
  const spliceInputRef = useRef<HTMLInputElement>(null);
  const [splicingStep, setSplicingStep] = useState<"FEEDER" | "OLD_SPOOL" | "NEW_SPOOL">("FEEDER");
  const [spliceFeederNumber, setSpliceFeederNumber] = useState("");
  const [oldSpool, setOldSpool] = useState("");
  const [newSpool, setNewSpool] = useState("");
  const [spliceRecords, setSpliceRecords] = useState<SpliceRecord[]>([]);
  const [showManualOverride, setShowManualOverride] = useState(false);
  const [manualOverrideData, setManualOverrideData] = useState<{
    expectedMPNs: string[];
  } | null>(null);

  const [scanState, setScanState] = useState<ScanState>({
    step: "FEEDER",
    feederNumber: null,
    scannedMPN: null,
    lotCode: null,
    bomMatch: null,
    error: null,
  });

  const { notify } = useNotification();

  const fetchScanLog = useCallback(async () => {
    if (!sessionId) return;

    try {
      const response = await fetch(`/api/verification/sessions/${sessionId}/scans`, {
        credentials: "include",
      });

      if (!response.ok) return;

      const data = await response.json();
      setScanLog(Array.isArray(data?.scans) ? data.scans : []);
    } catch {
      // Keep scanner flow uninterrupted even if log polling fails.
    }
  }, [sessionId]);

  useEffect(() => {
    fetchScanLog();
    const interval = setInterval(fetchScanLog, 2000);
    return () => clearInterval(interval);
  }, [fetchScanLog]);

  const formatScanTime = (value: string) => {
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return "--";
    return dt.toLocaleTimeString();
  };

  const formatExpectedMpns = (scan: ScanLogRecord) => {
    return [scan.bom?.mpn1, scan.bom?.mpn2, scan.bom?.mpn3].filter(Boolean).join(" | ") || "--";
  };

  const verifiedFeeders = new Set(
    scanLog
      .filter((scan) => scan.status === "verified")
      .map((scan) => scan.feederNumber.trim().toUpperCase()),
  );

  const handleSpliceInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();

    const value = (e.target as HTMLInputElement).value.trim().toUpperCase();
    if (!value) {
      notify.error("Scan required", "Please scan a barcode value.");
      return;
    }

    if (splicingStep === "FEEDER") {
      if (!verifiedFeeders.has(value)) {
        notify.error(
          `Feeder ${value} not verified`,
          "Verify this feeder first in loading section before splicing.",
        );
        return;
      }

      setSpliceFeederNumber(value);
      setSplicingStep("OLD_SPOOL");
      (e.target as HTMLInputElement).value = "";
      notify.success(`Feeder ${value} accepted`);
      return;
    }

    if (splicingStep === "OLD_SPOOL") {
      setOldSpool(value);
      setSplicingStep("NEW_SPOOL");
      (e.target as HTMLInputElement).value = "";
      return;
    }

    if (value === oldSpool) {
      notify.error("Invalid new spool", "New spool barcode must differ from old spool barcode.");
      return;
    }

    setNewSpool(value);
    setSpliceRecords((prev) => [
      {
        feederNumber: spliceFeederNumber,
        oldSpool,
        newSpool: value,
        timestamp: new Date().toLocaleTimeString(),
      },
      ...prev,
    ]);

    notify.success(
      `Splice recorded for ${spliceFeederNumber}`,
      `Old: ${oldSpool} -> New: ${value}`,
    );

    setSplicingStep("FEEDER");
    setSpliceFeederNumber("");
    setOldSpool("");
    setNewSpool("");
    (e.target as HTMLInputElement).value = "";
  };

  // PLAYBACK BUZZER
  const playBuzzer = (type: "success" | "error" = "error") => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    if (type === "success") {
      oscillator.frequency.value = 800;
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    } else {
      oscillator.frequency.value = 300;
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    }
  };

  // CLEAR INPUT
  const clearInput = () => {
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.focus();
    }
  };

  // HANDLE SCAN INPUT
  const handleScanInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const value = (e.target as HTMLInputElement).value.trim();

    if (e.key === "Enter") {
      e.preventDefault();

      if (value.length < 2) {
        notify.error("Scan too short", "Barcode must be at least 2 characters");
        clearInput();
        return;
      }

      if (scanState.step === "FEEDER") {
        validateFeeder(value);
      } else if (scanState.step === "MPN") {
        validateMPN(value);
      } else if (scanState.step === "LOT") {
        handleLotCodeSubmit(value);
      }
    }
  };

  // STEP 1: FEEDER VALIDATION
  const validateFeeder = async (feederNumber: string) => {
    try {
      const response = await fetch(`/api/verification/check-feeder`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, feederNumber }),
      });

      const data = await response.json();

      if (data.alreadyScanned) {
        notify.error(
          `Feeder "${feederNumber}" already verified`,
          "To re-scan, use reset button."
        );
        playBuzzer("error");
        clearInput();
        return;
      }

      if (!data.found) {
        notify.error(`Feeder "${feederNumber}" not found in BOM`, "Check the feeder number.");
        playBuzzer("error");
        clearInput();
        return;
      }

      // FEEDER FOUND
      notify.success(`✓ Feeder "${feederNumber}" found`);
      playBuzzer("success");

      setScanState({
        ...scanState,
        step: "MPN",
        feederNumber: feederNumber,
        bomMatch: data.bomData,
      });

      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (err) {
      notify.error("Validation failed", (err as Error).message);
      playBuzzer("error");
      clearInput();
    }
  };

  // STEP 2: MPN VALIDATION (STRICT)
  const validateMPN = async (scannedValue: string) => {
    try {
      const response = await fetch(`/api/verification/validate-mpn`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          feederNumber: scanState.feederNumber,
          scannedValue,
        }),
      });

      const result = await response.json();

      if (!result.valid) {
        const expected = [
          scanState.bomMatch?.mpn1,
          scanState.bomMatch?.mpn2,
          scanState.bomMatch?.mpn3,
        ]
          .filter(Boolean)
          .join(" | ");

        notify.error(
          `MPN mismatch for feeder ${scanState.feederNumber}`,
          `Scanned: ${scannedValue}\nExpected: ${expected}`
        );
        playBuzzer("error");

        // SHOW MANUAL OVERRIDE MODAL
        setManualOverrideData({
          expectedMPNs: [
            scanState.bomMatch?.mpn1,
            scanState.bomMatch?.mpn2,
            scanState.bomMatch?.mpn3,
          ].filter(Boolean) as string[],
        });
        setShowManualOverride(true);
        clearInput();
        return;
      }

      // MPN MATCHED
      if (result.isAlternate) {
        notify.warning(
          `Alternate component for feeder ${scanState.feederNumber}`,
          `Matched: ${result.matchedField} (${result.matchedMake})\n${result.alternateCount} alternates available`
        );
      } else {
        notify.success(`✓ MPN matched for feeder ${scanState.feederNumber}`);
      }

      playBuzzer("success");

      setScanState({
        ...scanState,
        step: "LOT",
        scannedMPN: scannedValue,
        bomMatch: {
          ...scanState.bomMatch!,
          matchedField: result.matchedField,
          matchedMake: result.matchedMake,
          isAlternate: result.isAlternate,
        },
      });

      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (err) {
      notify.error("MPN validation failed", (err as Error).message);
      playBuzzer("error");
      clearInput();
    }
  };

  // STEP 3: LOT CODE & SAVE
  const handleLotCodeSubmit = async (lotCode: string) => {
    try {
      const response = await fetch(`/api/verification/save-scan`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          feederNumber: scanState.feederNumber,
          scannedValue: scanState.scannedMPN,
          lotCode: lotCode || null,
          matchedField: scanState.bomMatch?.matchedField,
          matchedMake: scanState.bomMatch?.matchedMake,
          status: "verified",
          verificationMode: "AUTO",
        }),
      });

      if (!response.ok) throw new Error("Failed to save scan");

      const data = await response.json();

      // UPDATE PROGRESS
      setProgress(data.progress);
      onProgress?.(data.progress);

      notify.success(
        `✓ Feeder ${scanState.feederNumber} verified`,
        `MPN: ${scanState.scannedMPN} | Lot: ${lotCode || "N/A"} | Progress: ${data.progress.verified}/${data.progress.total}`
      );

      playBuzzer("success");

      fetchScanLog();

      // RESET FOR NEXT SCAN
      setScanState({
        step: "FEEDER",
        feederNumber: null,
        scannedMPN: null,
        lotCode: null,
        bomMatch: null,
        error: null,
      });

      setTimeout(() => inputRef.current?.focus(), 1000);
    } catch (err) {
      notify.error("Failed to save scan", (err as Error).message);
      playBuzzer("error");
    }
  };

  // SKIP LOT CODE
  const handleSkipLotCode = () => {
    handleLotCodeSubmit("");
  };

  // HANDLE MANUAL OVERRIDE APPROVAL
  const handleManualOverrideApproved = async (
    approverRole: "supervisor" | "qa",
    approverName: string
  ) => {
    try {
      // Save the scan with manual override flag
      const response = await fetch(`/api/verification/save-scan`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          feederNumber: scanState.feederNumber,
          scannedValue: scanState.scannedMPN,
          lotCode: null,
          matchedField: "manual_override",
          matchedMake: null,
          status: "verified",
          verificationMode: "MANUAL_OVERRIDE",
          approvedBy: approverName,
          approvedByRole: approverRole,
        }),
      });

      if (!response.ok) throw new Error("Failed to save override scan");

      const data = await response.json();

      notify.success(
        `✓ Override approved and saved`,
        `Feeder ${scanState.feederNumber} | MPN: ${scanState.scannedMPN} | Approved by: ${approverName}`
      );

      // UPDATE PROGRESS
      setProgress(data.progress);
      onProgress?.(data.progress);

      fetchScanLog();

      // RESET FOR NEXT SCAN
      setScanState({
        step: "FEEDER",
        feederNumber: null,
        scannedMPN: null,
        lotCode: null,
        bomMatch: null,
        error: null,
      });

      setTimeout(() => inputRef.current?.focus(), 1000);
    } catch (err) {
      notify.error("Failed to save override", (err as Error).message);
      playBuzzer("error");
    }
  };

  // RESET SESSION
  const handleResetSession = async () => {
    if (!window.confirm("Reset this session? All scans will be deleted.")) return;

    try {
      const response = await fetch(`/api/verification/sessions/${sessionId}/reset`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) throw new Error("Reset failed");

      notify.success("✓ Session reset", "All scans cleared. Ready to start over.");
      setScanState({
        step: "FEEDER",
        feederNumber: null,
        scannedMPN: null,
        lotCode: null,
        bomMatch: null,
        error: null,
      });
      setProgress({ verified: 0, total: 0, percent: 0 });
      setScanLog([]);
      setSplicingStep("FEEDER");
      setSpliceFeederNumber("");
      setOldSpool("");
      setNewSpool("");
      setSpliceRecords([]);
      if (spliceInputRef.current) {
        spliceInputRef.current.value = "";
      }
      clearInput();
    } catch (err) {
      notify.error("Reset failed", (err as Error).message);
    }
  };

  const handleDownloadFinalReport = async () => {
    try {
      const response = await fetch(`/api/verification/sessions/${sessionId}/final-report`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to generate final report");
      }

      const report = await response.json();
      report.splices = spliceRecords;

      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeSession = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, "_");

      link.href = url;
      link.download = `final-report-${safeSession}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      notify.success("Final report downloaded", `Session ${sessionId} report exported as JSON.`);
    } catch (err) {
      notify.error("Final report failed", (err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      {/* PROGRESS BAR */}
      <Card className="border-l-4 border-l-blue-500">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Verification Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>
                {progress.verified} / {progress.total} verified
              </span>
              <span className="text-lg font-bold text-blue-600">{progress.percent}%</span>
            </div>
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SCAN INPUT AREA */}
      <Card className="border-2 border-blue-300">
        <CardHeader>
          <CardTitle className="text-lg">
            {scanState.step === "FEEDER" && "📦 Scan Feeder Number"}
            {scanState.step === "MPN" && `🔍 Scan MPN for ${scanState.feederNumber}`}
            {scanState.step === "LOT" && `🏷️ Scan Lot Code (optional)`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* FEEDER STEP */}
          {scanState.step === "FEEDER" && (
            <div className="space-y-2">
              <Label htmlFor="feeder-input">Feeder Number</Label>
              <Input
                id="feeder-input"
                ref={inputRef}
                type="text"
                placeholder="Scan feeder barcode..."
                onKeyDown={handleScanInput}
                className="text-lg font-bold py-2"
                autoFocus
              />
              <p className="text-xs text-gray-500">Press Enter after scanning</p>
            </div>
          )}

          {/* MPN STEP */}
          {scanState.step === "MPN" && scanState.bomMatch && (
            <div className="space-y-3">
              <div className="bg-blue-50 p-3 rounded-lg space-y-1">
                <div className="text-sm">
                  <span className="text-gray-600">Expected MPN(s): </span>
                  <span className="font-bold">
                    {[
                      scanState.bomMatch.mpn1,
                      scanState.bomMatch.mpn2,
                      scanState.bomMatch.mpn3,
                    ]
                      .filter(Boolean)
                      .join(" | ")}
                  </span>
                </div>
                {scanState.bomMatch.description && (
                  <div className="text-xs text-gray-600">
                    {scanState.bomMatch.description}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="mpn-input">MPN / Part Number</Label>
                <Input
                  id="mpn-input"
                  ref={inputRef}
                  type="text"
                  placeholder="Scan MPN barcode..."
                  onKeyDown={handleScanInput}
                  className="text-lg font-bold py-2"
                  autoFocus
                />
                <p className="text-xs text-gray-500">Press Enter after scanning</p>
              </div>
            </div>
          )}

          {/* LOT CODE STEP */}
          {scanState.step === "LOT" && (
            <div className="space-y-3">
              <div className="bg-green-50 p-3 rounded-lg">
                <div className="text-sm font-semibold text-green-700">✓ MPN matched</div>
                <div className="text-xs text-gray-600 mt-1">
                  Field: {scanState.bomMatch?.matchedField}
                  {scanState.bomMatch?.matchedMake && ` (${scanState.bomMatch.matchedMake})`}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lot-input">Lot Code</Label>
                <Input
                  id="lot-input"
                  ref={inputRef}
                  type="text"
                  placeholder="Scan lot code (or press Enter to skip)..."
                  onKeyDown={handleScanInput}
                  className="text-lg font-bold py-2"
                  autoFocus
                />
                <p className="text-xs text-gray-500">
                  Press Enter to save, or leave blank to skip
                </p>
              </div>
              <Button
                onClick={handleSkipLotCode}
                variant="outline"
                className="w-full"
              >
                Skip Lot Code & Save
              </Button>
            </div>
          )}

          {/* ERROR MESSAGE */}
          {scanState.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-700">{scanState.error}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* REAL-TIME SCAN LOG */}
      {scanLog.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Scan Log - Last 20 Records</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-xs">
                <thead>
                  <tr className="border-b text-left text-gray-600">
                    <th className="py-2 pr-3">Time</th>
                    <th className="py-2 pr-3">Feeder</th>
                    <th className="py-2 pr-3">Scanned Value</th>
                    <th className="py-2 pr-3">Expected (BOM)</th>
                    <th className="py-2 pr-3">Matched Field</th>
                    <th className="py-2 pr-3">Make</th>
                    <th className="py-2 pr-3">Lot Code</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Mode</th>
                    <th className="py-2 pr-3">Approved By</th>
                  </tr>
                </thead>
                <tbody>
                  {scanLog.map((scan) => (
                    <tr key={scan.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-3 whitespace-nowrap">{formatScanTime(scan.scannedAt)}</td>
                      <td className="py-2 pr-3 font-semibold">{scan.feederNumber}</td>
                      <td className="py-2 pr-3 font-mono">{scan.scannedValue}</td>
                      <td className="py-2 pr-3">{formatExpectedMpns(scan)}</td>
                      <td className="py-2 pr-3">{scan.matchedField || "--"}</td>
                      <td className="py-2 pr-3">{scan.matchedMake || "--"}</td>
                      <td className="py-2 pr-3">{scan.lotCode || "--"}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={`inline-flex rounded px-2 py-0.5 font-semibold ${
                            scan.status === "verified"
                              ? "bg-green-100 text-green-700"
                              : scan.status === "failed"
                                ? "bg-red-100 text-red-700"
                                : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {scan.status}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={`inline-flex rounded px-2 py-0.5 font-semibold ${
                            scan.verificationMode === "MANUAL_OVERRIDE"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {scan.verificationMode}
                        </span>
                      </td>
                      <td className="py-2 pr-3">{scan.approvedBy || "--"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* CONTROLS */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button onClick={handleDownloadFinalReport} variant="secondary" className="w-full">
          Download Final Report
        </Button>
        <Button onClick={handleResetSession} variant="destructive" className="w-full">
          Reset Session
        </Button>
      </div>

      {/* PHASE 4: AUTO SPLICING SECTION */}
      {progress.total > 0 && progress.verified >= progress.total && (
        <Card className="border-2 border-amber-300">
          <CardHeader>
            <CardTitle className="text-lg">Auto Splicing Section</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm font-semibold text-amber-700">
              {splicingStep === "FEEDER" && "STEP 1 / 3 - Scan Feeder Number"}
              {splicingStep === "OLD_SPOOL" && `STEP 2 / 3 - Scan Old Spool (${spliceFeederNumber})`}
              {splicingStep === "NEW_SPOOL" && `STEP 3 / 3 - Scan New Spool (${spliceFeederNumber})`}
            </div>

            <Input
              ref={spliceInputRef}
              type="text"
              placeholder={
                splicingStep === "FEEDER"
                  ? "Scan feeder barcode..."
                  : splicingStep === "OLD_SPOOL"
                    ? "Scan old spool barcode..."
                    : "Scan new spool barcode..."
              }
              className="text-lg font-bold py-2"
              onKeyDown={handleSpliceInput}
            />

            {spliceRecords.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-xs">
                  <thead>
                    <tr className="border-b text-left text-gray-600">
                      <th className="py-2 pr-3">Time</th>
                      <th className="py-2 pr-3">Feeder</th>
                      <th className="py-2 pr-3">Old Spool</th>
                      <th className="py-2 pr-3">New Spool</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spliceRecords.map((record, idx) => (
                      <tr key={`${record.feederNumber}-${record.timestamp}-${idx}`} className="border-b last:border-b-0">
                        <td className="py-2 pr-3 whitespace-nowrap">{record.timestamp}</td>
                        <td className="py-2 pr-3 font-semibold">{record.feederNumber}</td>
                        <td className="py-2 pr-3 font-mono">{record.oldSpool}</td>
                        <td className="py-2 pr-3 font-mono">{record.newSpool}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* MANUAL OVERRIDE MODAL */}
      {manualOverrideData && (
        <ManualOverrideModal
          isOpen={showManualOverride}
          onClose={() => setShowManualOverride(false)}
          feederNumber={scanState.feederNumber || ""}
          scannedValue={scanState.scannedMPN || ""}
          expectedMPNs={manualOverrideData.expectedMPNs}
          onApproved={handleManualOverrideApproved}
        />
      )}
    </div>
  );
};
