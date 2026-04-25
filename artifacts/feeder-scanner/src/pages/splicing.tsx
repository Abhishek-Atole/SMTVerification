// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Scissors, ArrowLeft } from "lucide-react";
import { useScanner } from "@/hooks/useScanner";
import { useNotification } from "@/hooks/use-notification";
import { useIsVerificationComplete } from "@/store/useVerificationStore";
import { useSplicingStore } from "@/store/useSplicingStore";
import { ScanNotification } from "@/components/notifications/ScanNotification";
import { LogPanel } from "@/components/LogPanel";
import { AppLogo } from "@/components/AppLogo";
import { appConfig } from "@/lib/appConfig";

type Step = "feeder" | "oldSpool" | "newSpool";

export default function SplicingPage() {
  const [, setLocation] = useLocation();
  const isVerificationComplete = useIsVerificationComplete();

  const records = useSplicingStore((s) => s.records);
  const saveRecord = useSplicingStore((s) => s.saveRecord);

  const [step, setStep] = useState<Step>("feeder");
  const [feederId, setFeederId] = useState("");
  const [oldSpool, setOldSpool] = useState("");

  const {
    notifications,
    dismissNotification,
    showErrorAlert,
    showSuccessAlert,
  } = useNotification();

  useEffect(() => {
    if (!isVerificationComplete) {
      setLocation("/verification");
    }
  }, [isVerificationComplete, setLocation]);

  useEffect(() => {
    document.title = `${appConfig.companyShort} | Splicing`;
  }, []);

  const currentLabel = useMemo(() => {
    if (step === "feeder") return "Scan FEEDER NUMBER";
    if (step === "oldSpool") return `Scan OLD SPOOL for ${feederId}`;
    return `Scan NEW SPOOL for ${feederId}`;
  }, [step, feederId]);

  const onScan = (raw: string) => {
    const value = raw.trim().toUpperCase();
    if (!value) {
      return;
    }

    if (step === "feeder") {
      setFeederId(value);
      setStep("oldSpool");
      return;
    }

    if (step === "oldSpool") {
      setOldSpool(value);
      setStep("newSpool");
      return;
    }

    try {
      saveRecord(feederId, oldSpool, value);
      showSuccessAlert(`Splicing saved for ${feederId}`);
      setStep("feeder");
      setFeederId("");
      setOldSpool("");
    } catch (error: any) {
      showErrorAlert(error?.message || "Splicing validation failed", "high");
    }
  };

  const { inputRef, value, setValue, handleKeyDown } = useScanner({
    onSubmit: onScan,
    autoFocus: true,
    resetAfterMs: 10000,
  });

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 app-noise">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AppLogo className="h-10 w-10" />
            <div>
              <h1 className="text-xl font-bold">Splicing Station</h1>
              <p className="text-xs text-muted-foreground">{appConfig.systemTitle}</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => setLocation("/verification")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back To Verification
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <Card className="panel-pop scan-surface">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Scissors className="h-5 w-5" /> Splicing Entry
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Label className="text-sm font-semibold">{currentLabel}</Label>
                <Input
                  ref={inputRef}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Scan and press Enter"
                  className="scan-input-surface h-14 text-center font-mono text-xl"
                  autoComplete="off"
                />

                <div className="text-xs text-muted-foreground">
                  Current: Feeder={feederId || "-"} | Old={oldSpool || "-"}
                </div>
              </CardContent>
            </Card>

            <Card className="panel-pop scan-surface">
              <CardHeader>
                <CardTitle>Saved Splicing Records</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {records.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No records yet.</div>
                ) : (
                  records.map((row, idx) => (
                    <div key={`${row.feederId}-${row.splicedAt.toISOString()}-${idx}`} className="grid grid-cols-4 gap-2 rounded border p-2 text-sm">
                      <div className="font-mono">{row.feederId}</div>
                      <div className="font-mono truncate">{row.oldSpoolMPN}</div>
                      <div className="font-mono truncate">{row.newSpoolMPN}</div>
                      <div>{row.verifiedAgainstBOM ? "BOM MATCH" : "INVALID"}</div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div>
            <LogPanel />
          </div>
        </div>
      </div>

      <ScanNotification notifications={notifications} onDismiss={dismissNotification} />
    </div>
  );
}
