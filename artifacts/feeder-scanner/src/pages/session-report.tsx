import { useState } from "react";
import { useRoute } from "wouter";
import { useGetSessionReport, useListSplices, getGetSessionReportQueryKey, getListSplicesQueryKey } from "@workspace/api-client-react";
import { Loader2, Download, FileText, CheckCircle2, AlertCircle, Clock, Scissors, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export default function SessionReport() {
  const [, params] = useRoute("/session/:id/report");
  const sessionId = Number(params?.id);

  const { data: report, isLoading } = useGetSessionReport(sessionId, {
    query: { enabled: !!sessionId, queryKey: getGetSessionReportQueryKey(sessionId) },
  });
  const { data: splices } = useListSplices(sessionId, {
    query: { enabled: !!sessionId, queryKey: getListSplicesQueryKey(sessionId) },
  });

  const [showOk, setShowOk] = useState(true);
  const [showReject, setShowReject] = useState(true);
  const [showSpoolBarcode, setShowSpoolBarcode] = useState(true);
  const [showSplices, setShowSplices] = useState(true);
  const [showCustomize, setShowCustomize] = useState(false);

  if (isLoading || !report) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  const { session, summary } = report;

  const filteredScans = session.scans.filter((s) => {
    if (s.status === "ok" && !showOk) return false;
    if (s.status === "reject" && !showReject) return false;
    return true;
  });

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("SMT FEEDER VERIFICATION REPORT", 14, 22);
    doc.setFontSize(10);
    doc.text(`Company: ${session.companyName}`, 14, 30);
    doc.text(`Panel: ${session.panelName}`, 14, 36);
    doc.text(`BOM: ${session.bomName || session.bomId}`, 14, 42);
    doc.text(`Date: ${format(new Date(session.startTime), "yyyy-MM-dd")}`, 14, 48);
    doc.text(`Supervisor: ${session.supervisorName}  |  Operator: ${session.operatorName}  |  Shift: ${session.shiftName}`, 14, 54);

    autoTable(doc, {
      startY: 62,
      head: [["Metric", "Value"]],
      body: [
        ["Status", session.status],
        ["Duration (min)", summary.durationMinutes?.toString() || "-"],
        ["Total BOM Items", summary.totalBomItems.toString()],
        ["Items Scanned", summary.scannedCount.toString()],
        ["Completion", `${summary.completionPercent}%`],
        ["OK Scans", summary.okCount.toString()],
        ["Reject Scans", summary.rejectCount.toString()],
        ["Missing Items", summary.missingCount.toString()],
        ...(showSplices ? [["Splices", (splices?.length ?? 0).toString()]] : []),
      ],
      theme: "grid",
    });

    const finalY = (doc as any).lastAutoTable.finalY || 62;

    if (filteredScans.length > 0) {
      doc.setFontSize(11);
      doc.text("SCAN LOG", 14, finalY + 10);
      const head = showSpoolBarcode
        ? [["Time", "Feeder", "Spool Barcode", "Part", "Status"]]
        : [["Time", "Feeder", "Part", "Status"]];
      const body = filteredScans.map((s) =>
        showSpoolBarcode
          ? [format(new Date(s.scannedAt), "HH:mm:ss"), s.feederNumber, (s as any).spoolBarcode || "-", s.partNumber || "-", s.status.toUpperCase()]
          : [format(new Date(s.scannedAt), "HH:mm:ss"), s.feederNumber, s.partNumber || "-", s.status.toUpperCase()]
      );
      autoTable(doc, { startY: finalY + 15, head, body, theme: "striped" });
    }

    if (showSplices && splices && splices.length > 0) {
      const spliceY = (doc as any).lastAutoTable?.finalY || finalY + 15;
      doc.setFontSize(11);
      doc.text("SPLICE LOG", 14, spliceY + 10);
      autoTable(doc, {
        startY: spliceY + 15,
        head: [["Time", "Feeder", "Old Spool", "New Spool", "Duration (s)"]],
        body: splices.map((sp) => [
          format(new Date(sp.splicedAt), "HH:mm:ss"),
          sp.feederNumber,
          sp.oldSpoolBarcode,
          sp.newSpoolBarcode,
          sp.durationSeconds?.toString() || "-",
        ]),
        theme: "striped",
      });
    }

    doc.save(`smt-report-${session.id}.pdf`);
  };

  const exportExcel = () => {
    const summarySheet = XLSX.utils.json_to_sheet([
      { Metric: "Session ID", Value: session.id },
      { Metric: "Company", Value: session.companyName },
      { Metric: "Panel", Value: session.panelName },
      { Metric: "BOM", Value: session.bomName || session.bomId },
      { Metric: "Supervisor", Value: session.supervisorName },
      { Metric: "Operator", Value: session.operatorName },
      { Metric: "Shift", Value: session.shiftName },
      { Metric: "Status", Value: session.status },
      { Metric: "Duration (min)", Value: summary.durationMinutes },
      { Metric: "Total BOM Items", Value: summary.totalBomItems },
      { Metric: "Completion %", Value: summary.completionPercent },
      { Metric: "OK Scans", Value: summary.okCount },
      { Metric: "Reject Scans", Value: summary.rejectCount },
      { Metric: "Splices", Value: splices?.length ?? 0 },
    ]);

    const scansData = filteredScans.map((s) => {
      const row: Record<string, string> = {
        Time: format(new Date(s.scannedAt), "yyyy-MM-dd HH:mm:ss"),
        Feeder: s.feederNumber,
        Part: s.partNumber || "",
        Status: s.status.toUpperCase(),
      };
      if (showSpoolBarcode) row["Spool Barcode"] = (s as any).spoolBarcode || "";
      return row;
    });
    const scansSheet = XLSX.utils.json_to_sheet(scansData);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");
    XLSX.utils.book_append_sheet(wb, scansSheet, "Scans");

    if (showSplices && splices && splices.length > 0) {
      const spliceSheet = XLSX.utils.json_to_sheet(
        splices.map((sp) => ({
          Time: format(new Date(sp.splicedAt), "yyyy-MM-dd HH:mm:ss"),
          Feeder: sp.feederNumber,
          "Old Spool": sp.oldSpoolBarcode,
          "New Spool": sp.newSpoolBarcode,
          "Duration (s)": sp.durationSeconds ?? "",
        }))
      );
      XLSX.utils.book_append_sheet(wb, spliceSheet, "Splices");
    }

    XLSX.writeFile(wb, `smt-report-${session.id}.xlsx`);
  };

  return (
    <div className="p-8 max-w-5xl mx-auto w-full space-y-8">
      {/* Header */}
      <div className="flex justify-between items-end border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-mono font-bold tracking-tight text-foreground">SESSION REPORT</h1>
          <p className="text-muted-foreground mt-2 font-mono">ID: {session.id} | {format(new Date(session.startTime), "PPpp")}</p>
        </div>
        <div className="flex gap-3 flex-wrap justify-end">
          <Button onClick={() => setShowCustomize(!showCustomize)} variant="outline" className="font-mono rounded-sm">
            <Settings2 className="w-4 h-4 mr-2" /> Customize
          </Button>
          <Button onClick={exportPDF} variant="secondary" className="font-mono rounded-sm" data-testid="btn-export-pdf">
            <FileText className="w-4 h-4 mr-2" /> PDF
          </Button>
          <Button onClick={exportExcel} variant="secondary" className="font-mono rounded-sm" data-testid="btn-export-excel">
            <Download className="w-4 h-4 mr-2" /> EXCEL
          </Button>
        </div>
      </div>

      {/* Customize Panel */}
      {showCustomize && (
        <div className="bg-card border border-border p-6 rounded-sm font-mono">
          <h3 className="font-bold text-sm tracking-wider text-muted-foreground mb-4">REPORT CUSTOMIZATION — choose what to include</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <Checkbox id="show-ok" checked={showOk} onCheckedChange={(v) => setShowOk(Boolean(v))} />
              <Label htmlFor="show-ok" className="cursor-pointer text-success font-bold">OK Scans</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="show-reject" checked={showReject} onCheckedChange={(v) => setShowReject(Boolean(v))} />
              <Label htmlFor="show-reject" className="cursor-pointer text-destructive font-bold">Reject Scans</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="show-spool" checked={showSpoolBarcode} onCheckedChange={(v) => setShowSpoolBarcode(Boolean(v))} />
              <Label htmlFor="show-spool" className="cursor-pointer">Spool Barcode column</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="show-splices" checked={showSplices} onCheckedChange={(v) => setShowSplices(Boolean(v))} />
              <Label htmlFor="show-splices" className="cursor-pointer text-amber-600 font-bold">Splice Records</Label>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Showing <strong>{filteredScans.length}</strong> of {session.scans.length} scan entries.
            {showSplices && splices?.length ? ` Includes ${splices.length} splice record(s).` : ""}
          </p>
        </div>
      )}

      {/* Session Info */}
      <div className="bg-card border border-border p-8 rounded-sm font-mono text-sm grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <div className="col-span-full mb-4 flex items-center justify-between">
          <div>
            {session.logoUrl && <img src={session.logoUrl} alt="Company Logo" className="h-12 object-contain mb-2" />}
          </div>
          <div className={`px-4 py-2 border-2 uppercase font-bold tracking-widest ${session.status === "completed" ? "border-success text-success" : "border-primary text-primary"}`}>
            {session.status}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-muted-foreground">COMPANY</div>
          <div className="font-bold text-lg">{session.companyName}</div>
          {session.customerName && <div className="text-muted-foreground">Customer: {session.customerName}</div>}
        </div>

        <div className="space-y-2">
          <div className="text-muted-foreground">ASSEMBLY</div>
          <div className="font-bold text-lg text-primary">{session.panelName}</div>
          <div className="text-muted-foreground">BOM: {session.bomName || session.bomId}</div>
        </div>

        <div className="space-y-2">
          <div className="text-muted-foreground">PERSONNEL</div>
          <div>Op: <span className="font-bold">{session.operatorName}</span></div>
          <div>Sup: <span className="font-bold">{session.supervisorName}</span></div>
          <div className="text-muted-foreground">Shift: {session.shiftName}</div>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-card border border-border p-4 rounded-sm flex flex-col items-center justify-center text-center">
          <div className="text-muted-foreground font-mono text-xs mb-2">COMPLETION</div>
          <div className="text-3xl font-mono font-bold text-primary">{summary.completionPercent}%</div>
        </div>
        <div className="bg-card border border-border p-4 rounded-sm flex flex-col items-center justify-center text-center">
          <div className="text-muted-foreground font-mono text-xs mb-2">DURATION</div>
          <div className="text-3xl font-mono font-bold flex items-center gap-2">
            <Clock className="w-5 h-5 text-muted-foreground" />
            {summary.durationMinutes || 0}m
          </div>
        </div>
        <div className="bg-card border border-border p-4 rounded-sm flex flex-col items-center justify-center text-center">
          <div className="text-muted-foreground font-mono text-xs mb-2">SCANNED / TOTAL</div>
          <div className="text-3xl font-mono font-bold">{summary.scannedCount}/{summary.totalBomItems}</div>
        </div>
        <div className="bg-card border border-border p-4 rounded-sm flex flex-col items-center justify-center text-center border-b-4 border-b-success">
          <div className="text-success font-mono text-xs mb-2 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> OK</div>
          <div className="text-3xl font-mono font-bold text-success">{summary.okCount}</div>
        </div>
        <div className="bg-card border border-border p-4 rounded-sm flex flex-col items-center justify-center text-center border-b-4 border-b-destructive">
          <div className="text-destructive font-mono text-xs mb-2 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> REJECT</div>
          <div className="text-3xl font-mono font-bold text-destructive">{summary.rejectCount}</div>
        </div>
      </div>

      {/* Scan Log Table */}
      <div className="bg-card border border-border rounded-sm overflow-hidden flex flex-col">
        <div className="bg-secondary/50 p-3 border-b border-border font-mono font-bold flex justify-between items-center">
          <span>SCAN LOG</span>
          <span className="text-sm font-normal text-muted-foreground">{filteredScans.length} entries shown</span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="font-mono">TIME</TableHead>
                <TableHead className="font-mono">FEEDER</TableHead>
                {showSpoolBarcode && <TableHead className="font-mono">SPOOL BARCODE</TableHead>}
                <TableHead className="font-mono">PART</TableHead>
                <TableHead className="font-mono">STATUS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredScans.length === 0 ? (
                <TableRow className="border-border">
                  <TableCell colSpan={showSpoolBarcode ? 5 : 4} className="text-center py-8 text-muted-foreground font-mono">
                    No entries match current filter settings
                  </TableCell>
                </TableRow>
              ) : (
                filteredScans.map((scan) => (
                  <TableRow key={scan.id} className="border-border">
                    <TableCell className="font-mono text-muted-foreground">{format(new Date(scan.scannedAt), "HH:mm:ss")}</TableCell>
                    <TableCell className="font-mono font-bold">{scan.feederNumber}</TableCell>
                    {showSpoolBarcode && (
                      <TableCell className="font-mono text-muted-foreground text-xs">{(scan as any).spoolBarcode || "-"}</TableCell>
                    )}
                    <TableCell className="font-mono text-muted-foreground">{scan.partNumber || "-"}</TableCell>
                    <TableCell className={`font-mono font-bold uppercase ${scan.status === "ok" ? "text-success" : "text-destructive"}`}>
                      {scan.status}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Splice Log Table */}
      {showSplices && splices && splices.length > 0 && (
        <div className="bg-card border border-amber-200 dark:border-amber-800 rounded-sm overflow-hidden flex flex-col">
          <div className="bg-amber-50/70 dark:bg-amber-950/30 p-3 border-b border-amber-200 dark:border-amber-800 font-mono font-bold flex items-center gap-2">
            <Scissors className="w-4 h-4 text-amber-600" />
            <span className="text-amber-700 dark:text-amber-400">SPLICE LOG</span>
            <span className="text-sm font-normal text-muted-foreground ml-2">{splices.length} splice(s)</span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="font-mono">TIME</TableHead>
                  <TableHead className="font-mono">FEEDER</TableHead>
                  <TableHead className="font-mono">OLD SPOOL</TableHead>
                  <TableHead className="font-mono">NEW SPOOL</TableHead>
                  <TableHead className="font-mono">DURATION</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {splices.map((sp) => (
                  <TableRow key={sp.id} className="border-border bg-amber-50/30 dark:bg-amber-950/10">
                    <TableCell className="font-mono text-muted-foreground">{format(new Date(sp.splicedAt), "HH:mm:ss")}</TableCell>
                    <TableCell className="font-mono font-bold">{sp.feederNumber}</TableCell>
                    <TableCell className="font-mono text-muted-foreground text-xs">{sp.oldSpoolBarcode}</TableCell>
                    <TableCell className="font-mono text-muted-foreground text-xs">{sp.newSpoolBarcode}</TableCell>
                    <TableCell className="font-mono text-amber-600 dark:text-amber-400 font-bold">
                      {sp.durationSeconds != null ? `${sp.durationSeconds}s` : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
