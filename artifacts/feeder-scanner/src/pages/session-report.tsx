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
  const [showAlternates, setShowAlternates] = useState(true);
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

  // Helper function to load logo from URL as data URL
  const loadLogoAsDataUrl = async (logoUrl: string): Promise<string> => {
    try {
      let imageResponse: Response;
      
      // Try to load the logo from public folder first
      if (logoUrl.endsWith(".svg")) {
        imageResponse = await fetch(logoUrl);
        const svgText = await imageResponse.text();
        const canvas = document.createElement("canvas");
        canvas.width = 200;
        canvas.height = 200;
        const ctx = canvas.getContext("2d");
        if (!ctx) return "";

        const img = new Image();
        const blob = new Blob([svgText], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        return new Promise((resolve) => {
          img.onload = () => {
            ctx.drawImage(img, 0, 0, 200, 200);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL("image/png"));
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve("");
          };
          img.src = url;
        });
      } else {
        // For PNG/JPEG, fetch and convert to data URL directly
        imageResponse = await fetch(logoUrl);
        const blob = await imageResponse.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = () => resolve("");
          reader.readAsDataURL(blob);
        });
      }
    } catch {
      return "";
    }
  };

  const exportPDF = async () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth(); // 297mm
    const pageH = doc.internal.pageSize.getHeight(); // 210mm
    const M = 10; // outer margin

    const changeoverId = `CHG${String(session.id).padStart(8, "0")}`;
    const startTimeStr = session.startTime ? format(new Date(session.startTime), "hh:mm:ss aa") : "N/A";
    const endTimeStr = session.endTime ? format(new Date(session.endTime), "hh:mm:ss aa") : "N/A";

    // ── Outer border ─────────────────────────────────────────────────
    doc.setDrawColor(60, 60, 60);
    doc.setLineWidth(1.0);
    doc.rect(M, M, pageW - 2 * M, pageH - 2 * M);

    // ── Professional Compact Header ─────────────────────────────────
    let y = M + 3;
    const logoSize = 18;
    const logoX = M + 2;
    const headerX = pageW / 2;

    // ── Company Logo (Left Side) ──────────────────────────────────
    let logoDataUrl = "";
    
    // Try to load logo: first from session, then from public folder (UCAL logo)
    if (session.logoUrl) {
      logoDataUrl = session.logoUrl;
      if (session.logoUrl.endsWith(".svg")) {
        logoDataUrl = await loadLogoAsDataUrl(session.logoUrl);
      }
    } else {
      // Load default UCAL logo from public folder
      try {
        logoDataUrl = await loadLogoAsDataUrl("/ucal-logo.png");
      } catch {
        logoDataUrl = "";
      }
    }

    if (logoDataUrl && !logoDataUrl.endsWith(".svg")) {
      try {
        const fmt = logoDataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
        doc.addImage(logoDataUrl, fmt, logoX, y, logoSize, logoSize);
      } catch (_) {
        // Fallback: Navy box with UCAL text
        doc.setDrawColor(10, 10, 60);
        doc.setLineWidth(0.4);
        doc.setFillColor(10, 10, 60);
        doc.rect(logoX, y, logoSize, logoSize, "F");
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text("UCAL", logoX + logoSize / 2, y + logoSize / 2 + 0.5, { align: "center" });
      }
    } else {
      // Fallback: Navy box with UCAL text
      doc.setDrawColor(10, 10, 60);
      doc.setLineWidth(0.4);
      doc.setFillColor(10, 10, 60);
      doc.rect(logoX, y, logoSize, logoSize, "F");
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("UCAL", logoX + logoSize / 2, y + logoSize / 2 + 0.5, { align: "center" });
    }

    // ── Title & Company (Centered)
    doc.setFontSize(15);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.text("SMT CHANGEOVER VERIFICATION REPORT", headerX, y + 7, { align: "center" });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(session.companyName, headerX, y + 12, { align: "center" });

    // ── Horizontal Separator Line (Professional)
    y = y + logoSize + 3;
    doc.setDrawColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.setLineWidth(0.5);
    doc.line(M, y, pageW - M, y);
    y += 5;

    // ── Details grid (3 rows × 5 cols) ───────────────────────────────
    const printKV = (label: string, value: string, x: number, yp: number) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(30, 30, 30);
      doc.text(label, x, yp);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
      const lw = doc.getTextWidth(label);
      doc.text(String(value), x + lw + 1, yp);
    };

    const colStep = (pageW - 2 * M - 4) / 5;
    const baseX = M + 3;
    const colX = (i: number) => baseX + i * colStep;

    printKV("Changeover ID:", changeoverId, colX(0), y);
    printKV("Panel ID:", session.panelName, colX(1), y);
    printKV("Shift:", session.shiftName, colX(2), y);
    printKV("Date:", session.shiftDate, colX(3), y);
    printKV("Duration:", `${summary.durationMinutes || 0} min`, colX(4), y);
    y += 5.5;

    printKV("Customer:", session.customerName || "N/A", colX(0), y);
    printKV("Machine:", "N/A", colX(1), y);
    printKV("Operator:", session.operatorName, colX(2), y);
    printKV("Start Time:", startTimeStr, colX(3), y);
    printKV("BOM Version:", session.bomName || "N/A", colX(4), y);
    y += 5.5;

    printKV("PCB/:", session.panelName.split(" ")[0] || "N/A", colX(0), y);
    printKV("Line:", "N/A", colX(1), y);
    printKV("QA:", session.qaName || "N/A", colX(2), y);
    printKV("End Time:", endTimeStr, colX(3), y);
    printKV("Supervisor:", session.supervisorName, colX(4), y);
    y += 6;

    // ── Section title ────────────────────────────────────────────────
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.text("Component Verification Details", pageW / 2, y, { align: "center" });
    y += 5;

    // ── Main Verification Table ───────────────────────────────────────
    const tblL = M + 2;
    const tblR = pageW - M - 2;
    const tblW = tblR - tblL; // 277mm

    // Column proportions summing to 1.0
    const props = [0.083, 0.075, 0.135, 0.062, 0.085, 0.16, 0.16, 0.053, 0.083, 0.084];
    const cw = props.map((p) => p * tblW);
    const colStyles: Record<number, any> = {};
    cw.forEach((w, i) => { colStyles[i] = { cellWidth: w }; });

    const tableRows = report.bomItems.map((item) => {
      const scan = bestScanMap.get(item.feederNumber.toLowerCase());
      const status = scan?.status === "ok" ? "PASS" : scan?.status === "reject" ? "FAIL" : "MISSING";
      return [
        item.feederNumber,
        item.location || "N/A",
        item.description || item.partNumber || "",
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
      tableWidth: tblW,
      margin: { left: tblL, right: M + 2 },
      headStyles: {
        fillColor: NAVY,
        textColor: WHITE,
        fontStyle: "bold",
        fontSize: 7.5,
        halign: "center",
        valign: "middle",
        cellPadding: 2,
        minCellHeight: 9,
      },
      bodyStyles: {
        fontSize: 7.5,
        halign: "center",
        valign: "middle",
        cellPadding: 1.5,
        minCellHeight: 7,
      },
      alternateRowStyles: { fillColor: LIGHT_ROW },
      columnStyles: colStyles,
      didParseCell: (data: any) => {
        if (data.section === "body" && data.column.index === 8) {
          if (data.cell.raw === "PASS") { data.cell.styles.textColor = [0, 140, 0]; data.cell.styles.fontStyle = "bold"; }
          else if (data.cell.raw === "FAIL") { data.cell.styles.textColor = [190, 0, 0]; data.cell.styles.fontStyle = "bold"; }
          else if (data.cell.raw === "MISSING") { data.cell.styles.textColor = [160, 90, 0]; }
        }
      },
    });

    y = (doc as any).lastAutoTable.finalY + 7;

    // ── Summary Table ────────────────────────────────────────────────
    const totalBomItems = report.bomItems.length;
    const passCount = [...bestScanMap.values()].filter((s) => s.status === "ok").length;
    const failCount = [...bestScanMap.values()].filter((s) => s.status === "reject").length;
    const passRate = totalBomItems > 0 ? `${((passCount / totalBomItems) * 100).toFixed(1)}%` : "0%";
    const isComplete = passCount === totalBomItems;

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Summary :", tblL, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [["Total Feeders Scanned", "PASS", "FAIL", "WARNING", "Pass Rate", "Status"]],
      body: [[totalBomItems.toString(), passCount.toString(), failCount.toString(), "0", passRate, isComplete ? "COMPLETE" : "INCOMPLETE"]],
      theme: "grid",
      tableWidth: tblW,
      margin: { left: tblL, right: M + 2 },
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: "bold", fontSize: 8.5, halign: "center", minCellHeight: 8 },
      bodyStyles: { fontSize: 9, halign: "center", fontStyle: "bold", minCellHeight: 8 },
      didParseCell: (data: any) => {
        if (data.section === "body") {
          if (data.column.index === 1) data.cell.styles.textColor = [0, 140, 0];
          if (data.column.index === 2 && Number(data.cell.raw) > 0) data.cell.styles.textColor = [190, 0, 0];
          if (data.column.index === 5) data.cell.styles.textColor = isComplete ? [0, 140, 0] : [190, 0, 0];
        }
      },
    });

    // ── Splice Log (if any) ──────────────────────────────────────────
    if (showSplices && splices && splices.length > 0) {
      y = (doc as any).lastAutoTable.finalY + 6;
      if (y + 20 > pageH - M) { doc.addPage(); y = M + 10; }
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text("Splice Log :", tblL, y);
      y += 4;
      autoTable(doc, {
        startY: y,
        head: [["Feeder No.", "Old Spool Barcode", "New Spool Barcode", "Duration (s)", "Time"]],
        body: splices.map((sp) => [sp.feederNumber, sp.oldSpoolBarcode, sp.newSpoolBarcode, sp.durationSeconds?.toString() || "-", format(new Date(sp.splicedAt), "HH:mm:ss")]),
        theme: "grid",
        tableWidth: tblW,
        margin: { left: tblL, right: M + 2 },
        headStyles: { fillColor: [140, 90, 0] as [number, number, number], textColor: WHITE, fontStyle: "bold", fontSize: 8, halign: "center" },
        bodyStyles: { fontSize: 8, halign: "center" },
      });
    }

    // ── Approvals ────────────────────────────────────────────────────
    y = (doc as any).lastAutoTable.finalY + 8;
    if (y + 28 > pageH - M) { doc.addPage(); y = M + 10; }

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Approvals :", tblL, y);
    y += 7;

    const aCol1 = tblL + 35;
    const aCol2 = pageW / 2;
    const aCol3 = tblR - 35;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Supervisor", aCol1, y, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.text("OPERATOR", aCol2, y, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.text("QA", aCol3, y, { align: "center" });

    y += 5.5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(session.supervisorName, aCol1, y, { align: "center" });
    doc.text(session.operatorName, aCol2, y, { align: "center" });
    doc.text("N/A", aCol3, y, { align: "center" });

    y += 4.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(130, 130, 130);
    doc.text("Name & Date", aCol1, y, { align: "center" });
    doc.text("Name & Date", aCol2, y, { align: "center" });
    doc.text("Name & Date", aCol3, y, { align: "center" });

    y += 7;
    doc.setDrawColor(90, 90, 90);
    doc.setLineDashPattern([2, 2], 0);
    const lineHalf = 44;
    doc.line(aCol1 - lineHalf, y, aCol1 + lineHalf, y);
    doc.line(aCol2 - lineHalf, y, aCol2 + lineHalf, y);
    doc.line(aCol3 - lineHalf, y, aCol3 + lineHalf, y);
    doc.setLineDashPattern([], 0);

    doc.save(`smt-changeover-report-${session.id}.pdf`);
  };

  const exportExcel = () => {
    const changeoverId = `CHG${String(session.id).padStart(8, "0")}`;
    const startTimeStr = session.startTime ? format(new Date(session.startTime), "hh:mm:ss aa") : "N/A";
    const endTimeStr = session.endTime ? format(new Date(session.endTime), "hh:mm:ss aa") : "N/A";
    const totalBomItems = report.bomItems.length;
    const passCount = [...bestScanMap.values()].filter((s) => s.status === "ok").length;
    const failCount = [...bestScanMap.values()].filter((s) => s.status === "reject").length;
    const passRate = totalBomItems > 0 ? `${((passCount / totalBomItems) * 100).toFixed(1)}%` : "0%";
    const isComplete = passCount === totalBomItems;

    // Build single sheet as array-of-arrays (10 columns = A..J)
    const aoa: (string | number)[][] = [];
    const merges: XLSX.Range[] = [];
    const addMerge = (r1: number, c1: number, r2: number, c2: number) =>
      merges.push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });

    let row = 0;

    // Row 0: Company name
    aoa.push([session.companyName, "", "", "", "", "", "", "", "", ""]);
    addMerge(row, 0, row, 9);
    row++;

    // Row 1: Report title
    aoa.push(["SMT CHANGEOVER VERIFICATION REPORT", "", "", "", "", "", "", "", "", ""]);
    addMerge(row, 0, row, 9);
    row++;

    // Row 2: blank
    aoa.push(["", "", "", "", "", "", "", "", "", ""]);
    row++;

    // Row 3: Header details row 1
    aoa.push([
      "Changeover ID:", changeoverId,
      "Panel ID:", session.panelName,
      "Shift:", session.shiftName,
      "Date:", session.shiftDate,
      "Duration:", `${summary.durationMinutes || 0} min`,
    ]);
    row++;

    // Row 4: Header details row 2
    aoa.push([
      "Customer:", session.customerName || "N/A",
      "Machine:", "N/A",
      "Operator:", session.operatorName,
      "Start Time:", startTimeStr,
      "BOM Version:", session.bomName || "N/A",
    ]);
    row++;

    // Row 5: Header details row 3
    aoa.push([
      "PCB/:", session.panelName.split(" ")[0] || "N/A",
      "Line:", "N/A",
      "QA:", session.qaName || "N/A",
      "End Time:", endTimeStr,
      "Supervisor:", session.supervisorName,
    ]);
    row++;

    // Row 6: blank
    aoa.push(["", "", "", "", "", "", "", "", "", ""]);
    row++;

    // Row 7: Section title
    aoa.push(["Component Verification Details", "", "", "", "", "", "", "", "", ""]);
    addMerge(row, 0, row, 9);
    row++;

    // Row 8: Table headers
    aoa.push(["Feeder No.", "Ref / Des", "Component", "Value", "Package Size", "Part Number", "Scanned Number", "Lot", "Status", "Time"]);
    row++;

    // Rows 9+: BOM verification data
    const dataStartRow = row;
    for (const item of report.bomItems) {
      const scan = bestScanMap.get(item.feederNumber.toLowerCase());
      const status = scan?.status === "ok" ? "PASS" : scan?.status === "reject" ? "FAIL" : "MISSING";
      aoa.push([
        item.feederNumber,
        item.location || "N/A",
        item.description || item.partNumber || "",
        "N/A",
        "N/A",
        item.partNumber,
        (scan as any)?.spoolBarcode || scan?.feederNumber || "-",
        "N/A",
        status,
        scan ? format(new Date(scan.scannedAt), "HH:mm:ss") : "-",
      ]);
      row++;
    }
    void dataStartRow;

    // Blank
    aoa.push(["", "", "", "", "", "", "", "", "", ""]);
    row++;

    // Summary section
    aoa.push(["Summary :", "", "", "", "", "", "", "", "", ""]);
    addMerge(row, 0, row, 9);
    row++;

    aoa.push(["Total Feeders Scanned", "PASS", "FAIL", "WARNING", "Pass Rate", "Status", "", "", "", ""]);
    row++;

    aoa.push([totalBomItems, passCount, failCount, 0, passRate, isComplete ? "COMPLETE" : "INCOMPLETE", "", "", "", ""]);
    row++;

    // All scans log
    aoa.push(["", "", "", "", "", "", "", "", "", ""]);
    row++;

    aoa.push(["All Scan Records", "", "", "", "", "", "", "", "", ""]);
    addMerge(row, 0, row, 9);
    row++;

    aoa.push(["Time", "Feeder No.", "Spool Barcode", "Part Number", "Status", "", "", "", "", ""]);
    row++;

    for (const s of filteredScans) {
      aoa.push([
        format(new Date(s.scannedAt), "HH:mm:ss"),
        s.feederNumber,
        (s as any).spoolBarcode || "-",
        s.partNumber || "-",
        s.status === "ok" ? "PASS" : "FAIL",
        "", "", "", "", "",
      ]);
      row++;
    }

    // Splice log
    if (showSplices && splices && splices.length > 0) {
      aoa.push(["", "", "", "", "", "", "", "", "", ""]);
      row++;

      aoa.push(["Splice Log", "", "", "", "", "", "", "", "", ""]);
      addMerge(row, 0, row, 9);
      row++;

      aoa.push(["Time", "Feeder No.", "Old Spool Barcode", "New Spool Barcode", "Duration (s)", "", "", "", "", ""]);
      row++;

      for (const sp of splices) {
        aoa.push([
          format(new Date(sp.splicedAt), "HH:mm:ss"),
          sp.feederNumber,
          sp.oldSpoolBarcode,
          sp.newSpoolBarcode,
          sp.durationSeconds ?? "-",
          "", "", "", "", "",
        ]);
        row++;
      }
    }

    // Approvals
    aoa.push(["", "", "", "", "", "", "", "", "", ""]);
    row++;
    aoa.push(["Approvals :", "", "", "", "", "", "", "", "", ""]);
    addMerge(row, 0, row, 9);
    row++;

    aoa.push(["Supervisor", "", "", "OPERATOR", "", "", "QA", "", "", ""]);
    addMerge(row, 0, row, 2);
    addMerge(row, 3, row, 5);
    addMerge(row, 6, row, 9);
    row++;

    aoa.push([session.supervisorName, "", "", session.operatorName, "", "", "N/A", "", "", ""]);
    addMerge(row, 0, row, 2);
    addMerge(row, 3, row, 5);
    addMerge(row, 6, row, 9);
    row++;

    aoa.push(["Name & Date", "", "", "Name & Date", "", "", "Name & Date", "", "", ""]);
    addMerge(row, 0, row, 2);
    addMerge(row, 3, row, 5);
    addMerge(row, 6, row, 9);
    row++;

    aoa.push(["____________________________", "", "", "____________________________", "", "", "____________________________", "", "", ""]);
    addMerge(row, 0, row, 2);
    addMerge(row, 3, row, 5);
    addMerge(row, 6, row, 9);
    row++;

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!merges"] = merges;

    // Column widths (characters)
    ws["!cols"] = [
      { wch: 14 }, // Feeder No.
      { wch: 14 }, // Ref/Des
      { wch: 24 }, // Component
      { wch: 10 }, // Value
      { wch: 16 }, // Package Size
      { wch: 28 }, // Part Number
      { wch: 28 }, // Scanned Number
      { wch: 10 }, // Lot
      { wch: 14 }, // Status
      { wch: 14 }, // Time
    ];

    // Row heights (points)
    ws["!rows"] = [
      { hpt: 22 }, // company
      { hpt: 20 }, // title
      { hpt: 8 },  // blank
      { hpt: 16 }, // detail row 1
      { hpt: 16 }, // detail row 2
      { hpt: 16 }, // detail row 3
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SMT Changeover Report");
    XLSX.writeFile(wb, `smt-changeover-report-${session.id}.xlsx`);
  };

  const passCount = [...bestScanMap.values()].filter((s) => s.status === "ok").length;
  const failCount = [...bestScanMap.values()].filter((s) => s.status === "reject").length;
  const isComplete = passCount === report.bomItems.length;

  return (
    <div className="p-6 max-w-6xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex justify-between items-end border-b border-border pb-4">
        <div className="flex items-start gap-6">
          {(session.logoUrl || "/ucal-logo.svg") && (
            <img src={session.logoUrl || "/ucal-logo.svg"} alt="UCAL Electronics" className="h-16 w-auto object-contain flex-shrink-0" />
          )}
          <div>
            <h1 className="text-3xl font-mono font-bold tracking-tight">SMT CHANGEOVER</h1>
            <h2 className="text-2xl font-mono font-bold tracking-tight text-primary">VERIFICATION REPORT</h2>
            <p className="text-muted-foreground mt-1 font-mono text-sm">
              CHG{String(session.id).padStart(8, "0")} | {session.companyName} | {format(new Date(session.startTime), "PPpp")}
            </p>
          </div>
        </div>
        <div className="flex gap-3 flex-wrap justify-end">
          <Button onClick={() => setShowCustomize(!showCustomize)} variant="outline" className="font-mono rounded-sm">
            <Settings2 className="w-4 h-4 mr-2" /> Customize
          </Button>
          <Button onClick={() => exportPDF()} variant="secondary" className="font-mono rounded-sm" data-testid="btn-export-pdf">
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
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
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
              <Checkbox id="chk-alternates" checked={showAlternates} onCheckedChange={(v) => setShowAlternates(Boolean(v))} />
              <Label htmlFor="chk-alternates" className="cursor-pointer text-orange-600 font-bold text-sm">Alternates</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="chk-latest" checked={latestOnly} onCheckedChange={(v) => setLatestOnly(Boolean(v))} />
              <Label htmlFor="chk-latest" className="cursor-pointer text-sm">Latest only</Label>
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
          <div><span className="font-bold text-muted-foreground">QA:</span> {session.qaName || "N/A"}</div>
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

      {/* Alternate Usage Analytics */}
      {showAlternates && (() => {
        // Collect alternates data from scans and BOM items
        const alternatesMap = new Map<string, any>();
        const bomItemsMap = new Map<number, any>();
        
        report.bomItems.forEach((item) => {
          bomItemsMap.set(item.id, item);
          if (item.isAlternate && item.parentItemId) {
            if (!alternatesMap.has(item.feederNumber)) {
              alternatesMap.set(item.feederNumber, []);
            }
            alternatesMap.get(item.feederNumber)?.push(item);
          }
        });

        // Track alternate usage from scans
        const alternateUsageData: any[] = [];
        let totalAlternatesUsed = 0;
        let totalCostSavings = 0;
        let totalLeadTimeImproved = 0;

        report.bomItems.forEach((primaryItem) => {
          if (primaryItem.isAlternate) return;
          
          const alternates = report.bomItems.filter(
            (item) =>
              item.isAlternate &&
              item.parentItemId === primaryItem.id &&
              item.feederNumber === primaryItem.feederNumber
          );

          if (alternates.length === 0) return;

          const primaryCost = parseFloat(primaryItem.cost || "0");
          const primaryLeadTime = primaryItem.leadTime || 0;

          alternates.forEach((alt) => {
            const altCost = parseFloat(alt.cost || "0");
            const altLeadTime = alt.leadTime || 0;
            const costDiff = primaryCost - altCost;
            const leadTimeDiff = primaryLeadTime - altLeadTime;

            const scansForItem = session.scans.filter(
              (s) =>
                s.feederNumber === alt.feederNumber &&
                s.status === "ok"
            );
            
            const alternateScans = scansForItem.length;
            if (alternateScans > 0) {
              totalAlternatesUsed += alternateScans;
              if (costDiff > 0) totalCostSavings += costDiff * alternateScans;
              if (leadTimeDiff > 0) totalLeadTimeImproved += leadTimeDiff * alternateScans;
            }

            alternateUsageData.push({
              feederNumber: alt.feederNumber,
              primaryPart: primaryItem.partNumber,
              alternatePart: alt.partNumber,
              primaryMpn: primaryItem.mpn,
              alternateMpn: alt.mpn,
              primaryCost,
              alternateCost: altCost,
              costSavings: costDiff,
              primaryLeadTime,
              altLeadTime,
              leadTimeImproved: leadTimeDiff,
              usageCount: alternateScans,
              manufacturer: alt.manufacturer,
            });
          });
        });

        if (alternateUsageData.length > 0) {
          return (
            <div className="space-y-4">
              {/* Analytics Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  {
                    label: "ALTERNATES USED",
                    value: totalAlternatesUsed,
                    color: "text-orange-600",
                    icon: "⚡",
                  },
                  {
                    label: "COST SAVED",
                    value: `$${totalCostSavings.toFixed(2)}`,
                    color: "text-green-600",
                    icon: "💰",
                  },
                  {
                    label: "LEAD TIME IMPROVED",
                    value: `${totalLeadTimeImproved} days`,
                    color: "text-blue-600",
                    icon: "⏱️",
                  },
                  {
                    label: "UNIQUE ALTERNATES",
                    value: alternateUsageData.length,
                    color: "text-purple-600",
                    icon: "🔄",
                  },
                ].map(({ label, value, color, icon }) => (
                  <div
                    key={label}
                    className="bg-card border border-border p-4 rounded-sm"
                  >
                    <div className="text-muted-foreground font-mono text-[10px] mb-2">
                      {icon} {label}
                    </div>
                    <div className={`text-2xl font-mono font-black ${color}`}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Alternate Usage Details Table */}
              <div className="bg-card border border-orange-200 dark:border-orange-800 rounded-sm overflow-hidden">
                <div className="bg-orange-50/70 dark:bg-orange-950/30 p-3 border-b border-orange-200 dark:border-orange-800 font-mono font-bold text-sm flex items-center gap-2">
                  <span className="text-orange-700 dark:text-orange-400">
                    ALTERNATE COMPONENT USAGE ANALYSIS
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-orange-50 dark:bg-orange-950/20">
                        <TableHead className="font-mono text-orange-900 dark:text-orange-300">
                          FEEDER
                        </TableHead>
                        <TableHead className="font-mono text-orange-900 dark:text-orange-300">
                          PRIMARY
                        </TableHead>
                        <TableHead className="font-mono text-orange-900 dark:text-orange-300">
                          ALTERNATE
                        </TableHead>
                        <TableHead className="font-mono text-orange-900 dark:text-orange-300">
                          USED
                        </TableHead>
                        <TableHead className="font-mono text-orange-900 dark:text-orange-300">
                          COST SAVING
                        </TableHead>
                        <TableHead className="font-mono text-orange-900 dark:text-orange-300">
                          LEAD TIME
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {alternateUsageData.map((row, idx) => (
                        <TableRow
                          key={idx}
                          className="border-orange-100 dark:border-orange-900"
                        >
                          <TableCell className="font-mono font-bold text-orange-600 dark:text-orange-400">
                            {row.feederNumber}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            <div className="font-bold">{row.primaryPart}</div>
                            <div className="text-muted-foreground text-xs">
                              {row.primaryMpn}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            <div className="font-bold">{row.alternatePart}</div>
                            <div className="text-muted-foreground text-xs">
                              {row.alternateMpn || row.manufacturer}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono font-bold text-center">
                            {row.usageCount}x
                          </TableCell>
                          <TableCell className="font-mono text-green-600 dark:text-green-400 font-bold">
                            {row.costSavings > 0
                              ? `${(row.costSavings * row.usageCount).toFixed(2)}`
                              : "—"}
                          </TableCell>
                          <TableCell className="font-mono text-blue-600 dark:text-blue-400 font-bold">
                            {row.leadTimeImproved > 0
                              ? `−${row.leadTimeImproved}d`
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          );
        }
        return null;
      })()}

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
            { title: "QA", name: session.qaName || "N/A" },
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
