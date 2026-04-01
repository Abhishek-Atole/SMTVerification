import { useState } from "react";
import { useRoute } from "wouter";
import {
  useGetSessionReport, useListSplices,
  getGetSessionReportQueryKey, getListSplicesQueryKey,
} from "@workspace/api-client-react";
import {
  Loader2, Download, FileText, CheckCircle2, AlertCircle,
  Clock, Scissors, Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const NAVY: [number, number, number] = [0, 51, 102];
const WHITE: [number, number, number] = [255, 255, 255];
const LIGHT_ROW: [number, number, number] = [220, 230, 242];

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
  const [latestOnly, setLatestOnly] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);

  if (isLoading || !report) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  const { session, summary } = report;

  const bestScanMap = new Map<string, typeof session.scans[0]>();
  for (const scan of session.scans) {
    const key = scan.feederNumber.toLowerCase();
    const existing = bestScanMap.get(key);
    if (!existing || scan.status === "ok" || new Date(scan.scannedAt) > new Date(existing.scannedAt)) {
      bestScanMap.set(key, scan);
    }
  }

  const filteredScans = (latestOnly ? [...bestScanMap.values()] : session.scans).filter((s) => {
    if (s.status === "ok" && !showOk) return false;
    if (s.status === "reject" && !showReject) return false;
    return true;
  });

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const M = 8;

    const changeoverId = `CHG${String(session.id).padStart(8, "0")}`;
    const startTimeStr = session.startTime ? format(new Date(session.startTime), "hh:mm:ss aa") : "N/A";
    const endTimeStr = session.endTime ? format(new Date(session.endTime), "hh:mm:ss aa") : "N/A";

    doc.setDrawColor(80, 80, 80);
    doc.setLineWidth(0.7);
    doc.rect(M, M, pageW - 2 * M, pageH - 2 * M);

    let y = M + 5;

    if (session.logoUrl) {
      try { doc.addImage(session.logoUrl, "JPEG", M + 3, y, 22, 22); } catch (_) {}
    }

    doc.setFontSize(17);
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.setFont("helvetica", "bold");
    doc.text("SMT CHANGEOVER VERIFICATION REPORT", pageW / 2, y + 13, { align: "center" });

    y += 28;

    const printCell = (label: string, value: string, x: number, yp: number) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      doc.text(label, x, yp);
      doc.setFont("helvetica", "normal");
      doc.text(value, x + doc.getTextWidth(label) + 1.5, yp);
    };

    const cx = (i: number) => M + 5 + i * 57;
    printCell("Changeover ID:", changeoverId, cx(0), y);
    printCell("Panel ID:", session.panelName, cx(1), y);
    printCell("Shift:", session.shiftName, cx(2), y);
    printCell("Date :", session.shiftDate, cx(3), y);
    printCell("Duration:", `${summary.durationMinutes || 0} min`, cx(4), y);

    y += 5.5;
    printCell("Customer:", session.customerName || "N/A", cx(0), y);
    printCell("Machine:", "N/A", cx(1), y);
    printCell("Operator :", session.operatorName, cx(2), y);
    printCell("Start Time:", startTimeStr, cx(3), y);
    printCell("BOM Version:", session.bomName || "N/A", cx(4), y);

    y += 5.5;
    printCell("PCB /", session.panelName.split(" ")[0] || "", cx(0), y);
    printCell("Line:", "N/A", cx(1), y);
    printCell("QA:", "N/A", cx(2), y);
    printCell("End Time:", endTimeStr, cx(3), y);

    y += 9;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.text("Component Verification Details", pageW / 2, y, { align: "center" });
    y += 5;

    const tableRows = report.bomItems.map((item) => {
      const scan = bestScanMap.get(item.feederNumber.toLowerCase());
      const status = scan?.status === "ok" ? "PASS" : scan?.status === "reject" ? "FAIL" : "MISSING";
      return [
        item.feederNumber,
        item.location || "N/A",
        item.description || item.partNumber,
        "N/A",
        "N/A",
        item.partNumber,
        (scan as any)?.spoolBarcode || scan?.feederNumber || "-",
        "N/A",
        status,
        scan ? format(new Date(scan.scannedAt), "HH:mm:ss") : "-",
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [["Feeder No.", "Ref / Des", "Component", "Value", "Package\nSize", "Part Number", "Scanned Number", "Lot", "Status", "Time"]],
      body: tableRows,
      theme: "grid",
      headStyles: {
        fillColor: NAVY,
        textColor: WHITE,
        fontStyle: "bold",
        fontSize: 7.5,
        halign: "center",
        valign: "middle",
        minCellHeight: 8,
      },
      bodyStyles: { fontSize: 7.5, halign: "center", valign: "middle" },
      alternateRowStyles: { fillColor: LIGHT_ROW },
      didParseCell: (data: any) => {
        if (data.section === "body" && data.column.index === 8) {
          const v = data.cell.raw;
          if (v === "PASS") { data.cell.styles.textColor = [0, 140, 0]; data.cell.styles.fontStyle = "bold"; }
          else if (v === "FAIL") { data.cell.styles.textColor = [190, 0, 0]; data.cell.styles.fontStyle = "bold"; }
          else if (v === "MISSING") { data.cell.styles.textColor = [150, 80, 0]; }
        }
      },
      margin: { left: M + 2, right: M + 2 },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 18 },
        2: { cellWidth: 30 },
        3: { cellWidth: 14 },
        4: { cellWidth: 18 },
        5: { cellWidth: 34 },
        6: { cellWidth: 34 },
        7: { cellWidth: 12 },
        8: { cellWidth: 18 },
        9: { cellWidth: 18 },
      },
    });

    y = (doc as any).lastAutoTable.finalY + 8;

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Summary :", M + 3, y);
    y += 5;

    const totalBomItems = report.bomItems.length;
    const passCount = [...bestScanMap.values()].filter((s) => s.status === "ok").length;
    const failCount = [...bestScanMap.values()].filter((s) => s.status === "reject").length;
    const passRate = totalBomItems > 0 ? (passCount / totalBomItems).toFixed(2) : "0.00";
    const isComplete = passCount === totalBomItems;

    autoTable(doc, {
      startY: y,
      head: [["Total Feeders Scanned", "PASS", "FAIL", "WARNING", "Pass Rate", "Status"]],
      body: [[totalBomItems.toString(), passCount.toString(), failCount.toString(), "0", passRate, isComplete ? "COMPLETE" : "INCOMPLETE"]],
      theme: "grid",
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: "bold", fontSize: 9, halign: "center" },
      bodyStyles: { fontSize: 9, halign: "center", fontStyle: "bold" },
      margin: { left: M + 2, right: M + 2 },
      didParseCell: (data: any) => {
        if (data.section === "body") {
          if (data.column.index === 1) data.cell.styles.textColor = [0, 140, 0];
          if (data.column.index === 2 && Number(data.cell.raw) > 0) data.cell.styles.textColor = [190, 0, 0];
          if (data.column.index === 5) data.cell.styles.textColor = isComplete ? [0, 140, 0] : [190, 0, 0];
        }
      },
    });

    if (showSplices && splices && splices.length > 0) {
      y = (doc as any).lastAutoTable.finalY + 8;
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text("Splice Log :", M + 3, y);
      y += 5;
      autoTable(doc, {
        startY: y,
        head: [["Feeder No.", "Old Spool Barcode", "New Spool Barcode", "Duration (s)", "Time"]],
        body: splices.map((sp) => [
          sp.feederNumber,
          sp.oldSpoolBarcode,
          sp.newSpoolBarcode,
          sp.durationSeconds?.toString() || "-",
          format(new Date(sp.splicedAt), "HH:mm:ss"),
        ]),
        theme: "grid",
        headStyles: { fillColor: [150, 100, 0] as [number,number,number], textColor: WHITE, fontStyle: "bold", fontSize: 8, halign: "center" },
        bodyStyles: { fontSize: 8, halign: "center" },
        margin: { left: M + 2, right: M + 2 },
      });
    }

    y = (doc as any).lastAutoTable.finalY + 10;

    const remaining = pageH - M - y;
    if (remaining < 30) {
      doc.addPage();
      y = M + 10;
    }

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Approvals :", M + 3, y);
    y += 8;

    const col1 = M + 42;
    const col2 = pageW / 2;
    const col3 = pageW - M - 42;

    doc.setFontSize(9.5);
    doc.setFont("helvetica", "normal");
    doc.text("Supervisor", col1, y, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.text("OPERATOR", col2, y, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.text("QA", col3, y, { align: "center" });

    y += 6;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(session.supervisorName, col1, y, { align: "center" });
    doc.text(session.operatorName, col2, y, { align: "center" });
    doc.text("N/A", col3, y, { align: "center" });

    y += 5;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(130, 130, 130);
    doc.text("Name & Date", col1, y, { align: "center" });
    doc.text("Name & Date", col2, y, { align: "center" });
    doc.text("Name & Date", col3, y, { align: "center" });

    y += 8;
    doc.setDrawColor(100, 100, 100);
    const dash: [number, number] = [2, 2];
    doc.setLineDashPattern(dash, 0);
    const lw = 46;
    doc.line(col1 - lw / 2, y, col1 + lw / 2, y);
    doc.line(col2 - lw / 2, y, col2 + lw / 2, y);
    doc.line(col3 - lw / 2, y, col3 + lw / 2, y);

    doc.save(`smt-changeover-report-${session.id}.pdf`);
  };

  const exportExcel = () => {
    const summarySheet = XLSX.utils.json_to_sheet([
      { Metric: "Changeover ID", Value: `CHG${String(session.id).padStart(8, "0")}` },
      { Metric: "Company", Value: session.companyName },
      { Metric: "Panel ID", Value: session.panelName },
      { Metric: "BOM Version", Value: session.bomName || session.bomId },
      { Metric: "Customer", Value: session.customerName || "N/A" },
      { Metric: "Supervisor", Value: session.supervisorName },
      { Metric: "Operator", Value: session.operatorName },
      { Metric: "Shift", Value: session.shiftName },
      { Metric: "Date", Value: session.shiftDate },
      { Metric: "Start Time", Value: session.startTime ? format(new Date(session.startTime), "hh:mm:ss aa") : "N/A" },
      { Metric: "End Time", Value: session.endTime ? format(new Date(session.endTime), "hh:mm:ss aa") : "N/A" },
      { Metric: "Duration (min)", Value: summary.durationMinutes },
      { Metric: "Total BOM Items", Value: summary.totalBomItems },
      { Metric: "Completion %", Value: summary.completionPercent },
      { Metric: "PASS", Value: summary.okCount },
      { Metric: "FAIL", Value: summary.rejectCount },
      { Metric: "Splices", Value: splices?.length ?? 0 },
    ]);

    const detailData = report.bomItems.map((item) => {
      const scan = bestScanMap.get(item.feederNumber.toLowerCase());
      const row: Record<string, string> = {
        "Feeder No.": item.feederNumber,
        "Ref / Des": item.location || "N/A",
        Component: item.description || item.partNumber,
        Value: "N/A",
        "Package Size": "N/A",
        "Part Number": item.partNumber,
        "Scanned Number": (scan as any)?.spoolBarcode || scan?.feederNumber || "-",
        Lot: "N/A",
        Status: scan?.status === "ok" ? "PASS" : scan?.status === "reject" ? "FAIL" : "MISSING",
        Time: scan ? format(new Date(scan.scannedAt), "HH:mm:ss") : "-",
      };
      return row;
    });
    const detailSheet = XLSX.utils.json_to_sheet(detailData);

    const scansData = filteredScans.map((s) => {
      const row: Record<string, string> = {
        Time: format(new Date(s.scannedAt), "yyyy-MM-dd HH:mm:ss"),
        "Feeder No.": s.feederNumber,
        "Part Number": s.partNumber || "",
        Status: s.status === "ok" ? "PASS" : "FAIL",
      };
      if (showSpoolBarcode) row["Spool Barcode"] = (s as any).spoolBarcode || "";
      return row;
    });
    const scansSheet = XLSX.utils.json_to_sheet(scansData);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");
    XLSX.utils.book_append_sheet(wb, detailSheet, "Verification Detail");
    XLSX.utils.book_append_sheet(wb, scansSheet, "All Scans");

    if (showSplices && splices && splices.length > 0) {
      const spliceSheet = XLSX.utils.json_to_sheet(
        splices.map((sp) => ({
          Time: format(new Date(sp.splicedAt), "yyyy-MM-dd HH:mm:ss"),
          "Feeder No.": sp.feederNumber,
          "Old Spool": sp.oldSpoolBarcode,
          "New Spool": sp.newSpoolBarcode,
          "Duration (s)": sp.durationSeconds ?? "",
        }))
      );
      XLSX.utils.book_append_sheet(wb, spliceSheet, "Splices");
    }

    XLSX.writeFile(wb, `smt-changeover-report-${session.id}.xlsx`);
  };

  const passCount = [...bestScanMap.values()].filter((s) => s.status === "ok").length;
  const failCount = [...bestScanMap.values()].filter((s) => s.status === "reject").length;
  const isComplete = passCount === report.bomItems.length;

  return (
    <div className="p-6 max-w-6xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex justify-between items-end border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-mono font-bold tracking-tight">SMT CHANGEOVER VERIFICATION REPORT</h1>
          <p className="text-muted-foreground mt-1 font-mono text-sm">
            CHG{String(session.id).padStart(8, "0")} | {session.companyName} | {format(new Date(session.startTime), "PPpp")}
          </p>
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
        <div className="bg-card border border-border p-5 rounded-sm font-mono">
          <h3 className="font-bold text-xs tracking-wider text-muted-foreground mb-4">REPORT CUSTOMIZATION</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="flex items-center gap-2">
              <Checkbox id="chk-ok" checked={showOk} onCheckedChange={(v) => setShowOk(Boolean(v))} />
              <Label htmlFor="chk-ok" className="cursor-pointer text-success font-bold text-sm">PASS Scans</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="chk-rej" checked={showReject} onCheckedChange={(v) => setShowReject(Boolean(v))} />
              <Label htmlFor="chk-rej" className="cursor-pointer text-destructive font-bold text-sm">FAIL Scans</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="chk-spool" checked={showSpoolBarcode} onCheckedChange={(v) => setShowSpoolBarcode(Boolean(v))} />
              <Label htmlFor="chk-spool" className="cursor-pointer text-sm">Spool Barcode</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="chk-splice" checked={showSplices} onCheckedChange={(v) => setShowSplices(Boolean(v))} />
              <Label htmlFor="chk-splice" className="cursor-pointer text-amber-600 font-bold text-sm">Splice Log</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="chk-latest" checked={latestOnly} onCheckedChange={(v) => setLatestOnly(Boolean(v))} />
              <Label htmlFor="chk-latest" className="cursor-pointer text-sm">Latest scan only</Label>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Showing <strong>{filteredScans.length}</strong> of {session.scans.length} scan records.
          </p>
        </div>
      )}

      {/* Session Info Grid */}
      <div className="bg-card border border-border p-6 rounded-sm font-mono text-sm">
        <div className="flex items-start justify-between mb-4">
          <div>
            {session.logoUrl && <img src={session.logoUrl} alt="Logo" className="h-12 object-contain mb-2" />}
            <div className="text-xl font-black text-foreground">{session.companyName}</div>
          </div>
          <div className={`px-4 py-2 border-2 uppercase font-bold tracking-widest text-base ${session.status === "completed" ? "border-success text-success" : "border-primary text-primary"}`}>
            {session.status}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-2 text-xs">
          <div><span className="font-bold text-muted-foreground">Changeover ID:</span> CHG{String(session.id).padStart(8, "0")}</div>
          <div><span className="font-bold text-muted-foreground">Panel ID:</span> {session.panelName}</div>
          <div><span className="font-bold text-muted-foreground">Shift:</span> {session.shiftName}</div>
          <div><span className="font-bold text-muted-foreground">Date:</span> {session.shiftDate}</div>
          <div><span className="font-bold text-muted-foreground">Customer:</span> {session.customerName || "N/A"}</div>
          <div><span className="font-bold text-muted-foreground">Operator:</span> {session.operatorName}</div>
          <div><span className="font-bold text-muted-foreground">Supervisor:</span> {session.supervisorName}</div>
          <div><span className="font-bold text-muted-foreground">BOM Version:</span> {session.bomName || "N/A"}</div>
          <div><span className="font-bold text-muted-foreground">Start Time:</span> {session.startTime ? format(new Date(session.startTime), "hh:mm:ss aa") : "N/A"}</div>
          <div><span className="font-bold text-muted-foreground">End Time:</span> {session.endTime ? format(new Date(session.endTime), "hh:mm:ss aa") : "N/A"}</div>
          <div><span className="font-bold text-muted-foreground">Duration:</span> {summary.durationMinutes || 0} min</div>
          <div><span className="font-bold text-muted-foreground">QA:</span> N/A</div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { label: "TOTAL FEEDERS", value: summary.totalBomItems, color: "text-foreground" },
          { label: "PASS", value: passCount, color: "text-success" },
          { label: "FAIL", value: failCount, color: "text-destructive" },
          { label: "WARNING", value: 0, color: "text-amber-500" },
          { label: "PASS RATE", value: `${summary.completionPercent}%`, color: "text-primary" },
          { label: "STATUS", value: isComplete ? "COMPLETE" : "INCOMPLETE", color: isComplete ? "text-success" : "text-destructive" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-card border border-border p-3 rounded-sm text-center">
            <div className="text-muted-foreground font-mono text-[10px] mb-1">{label}</div>
            <div className={`text-xl font-mono font-black ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Component Verification Details Table */}
      <div className="bg-card border border-border rounded-sm overflow-hidden">
        <div className="p-3 border-b border-border font-mono font-bold text-sm flex items-center gap-2" style={{ backgroundColor: "rgb(0,51,102)", color: "white" }}>
          Component Verification Details
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow style={{ backgroundColor: "rgb(0,51,102)" }} className="hover:bg-transparent border-0">
                {["Feeder No.", "Ref / Des", "Component", "Part Number", showSpoolBarcode ? "Scanned Number" : null, "Lot", "Status", "Time"]
                  .filter(Boolean).map((h) => (
                  <TableHead key={h} className="font-mono font-bold text-white text-center border-r border-blue-800 last:border-0">{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.bomItems.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No BOM items</TableCell></TableRow>
              ) : (
                report.bomItems.map((item, idx) => {
                  const scan = bestScanMap.get(item.feederNumber.toLowerCase());
                  const status = scan?.status === "ok" ? "PASS" : scan?.status === "reject" ? "FAIL" : "MISSING";
                  return (
                    <TableRow key={item.id} className={idx % 2 === 1 ? "bg-blue-50 dark:bg-blue-950/20" : ""}>
                      <TableCell className="font-mono font-bold text-center">{item.feederNumber}</TableCell>
                      <TableCell className="font-mono text-center text-muted-foreground text-sm">{item.location || "N/A"}</TableCell>
                      <TableCell className="font-mono text-center text-sm">{item.description || item.partNumber}</TableCell>
                      <TableCell className="font-mono text-center text-sm">{item.partNumber}</TableCell>
                      {showSpoolBarcode && <TableCell className="font-mono text-center text-sm text-muted-foreground">{(scan as any)?.spoolBarcode || scan?.feederNumber || "-"}</TableCell>}
                      <TableCell className="font-mono text-center text-muted-foreground text-sm">N/A</TableCell>
                      <TableCell className={`font-mono font-black text-center ${status === "PASS" ? "text-success" : status === "FAIL" ? "text-destructive" : "text-amber-600"}`}>{status}</TableCell>
                      <TableCell className="font-mono text-center text-muted-foreground text-sm">{scan ? format(new Date(scan.scannedAt), "HH:mm:ss") : "-"}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Full Scan Log */}
      <div className="bg-card border border-border rounded-sm overflow-hidden">
        <div className="bg-secondary/50 p-3 border-b border-border font-mono font-bold text-sm flex justify-between items-center">
          <span>ALL SCAN RECORDS</span>
          <span className="text-sm font-normal text-muted-foreground">{filteredScans.length} entries{latestOnly ? " (latest per feeder)" : ""}</span>
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
                <TableRow><TableCell colSpan={showSpoolBarcode ? 5 : 4} className="text-center py-8 text-muted-foreground font-mono">No entries match filter</TableCell></TableRow>
              ) : (
                filteredScans.map((scan) => (
                  <TableRow key={scan.id} className="border-border">
                    <TableCell className="font-mono text-muted-foreground text-sm">{format(new Date(scan.scannedAt), "HH:mm:ss")}</TableCell>
                    <TableCell className="font-mono font-bold">{scan.feederNumber}</TableCell>
                    {showSpoolBarcode && <TableCell className="font-mono text-muted-foreground text-xs">{(scan as any).spoolBarcode || "-"}</TableCell>}
                    <TableCell className="font-mono text-muted-foreground text-sm">{scan.partNumber || "-"}</TableCell>
                    <TableCell className={`font-mono font-black uppercase text-sm ${scan.status === "ok" ? "text-success" : "text-destructive"}`}>
                      {scan.status === "ok" ? "PASS" : "FAIL"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Splice Log */}
      {showSplices && splices && splices.length > 0 && (
        <div className="bg-card border border-amber-200 dark:border-amber-800 rounded-sm overflow-hidden">
          <div className="bg-amber-50/70 dark:bg-amber-950/30 p-3 border-b border-amber-200 dark:border-amber-800 font-mono font-bold text-sm flex items-center gap-2">
            <Scissors className="w-4 h-4 text-amber-600" />
            <span className="text-amber-700 dark:text-amber-400">SPLICE LOG — {splices.length} splice(s)</span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-mono">TIME</TableHead>
                  <TableHead className="font-mono">FEEDER</TableHead>
                  <TableHead className="font-mono">OLD SPOOL</TableHead>
                  <TableHead className="font-mono">NEW SPOOL</TableHead>
                  <TableHead className="font-mono">DURATION</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {splices.map((sp) => (
                  <TableRow key={sp.id} className="bg-amber-50/30 dark:bg-amber-950/10">
                    <TableCell className="font-mono text-muted-foreground text-sm">{format(new Date(sp.splicedAt), "HH:mm:ss")}</TableCell>
                    <TableCell className="font-mono font-bold">{sp.feederNumber}</TableCell>
                    <TableCell className="font-mono text-muted-foreground text-xs">{sp.oldSpoolBarcode}</TableCell>
                    <TableCell className="font-mono text-muted-foreground text-xs">{sp.newSpoolBarcode}</TableCell>
                    <TableCell className="font-mono text-amber-600 font-bold">{sp.durationSeconds != null ? `${sp.durationSeconds}s` : "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Approvals */}
      <div className="bg-card border border-border rounded-sm p-6 font-mono">
        <div className="font-bold text-sm mb-6">Approvals :</div>
        <div className="grid grid-cols-3 gap-8 text-center">
          {[
            { title: "Supervisor", name: session.supervisorName },
            { title: "OPERATOR", name: session.operatorName },
            { title: "QA", name: "N/A" },
          ].map(({ title, name }) => (
            <div key={title} className="flex flex-col items-center gap-2">
              <span className={`font-bold text-sm ${title === "OPERATOR" ? "text-foreground uppercase" : "text-muted-foreground"}`}>{title}</span>
              <span className="font-bold">{name}</span>
              <span className="text-xs text-muted-foreground">Name & Date</span>
              <div className="w-full border-b-2 border-dashed border-border mt-4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
