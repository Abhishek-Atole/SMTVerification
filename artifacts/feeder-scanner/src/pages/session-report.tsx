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
import { AppLogo } from "@/components/AppLogo";
import { appConfig } from "@/lib/appConfig";

const C_NAVY = "#0F172A";
const C_WHITE = "#FFFFFF";
const C_CYAN = "#06B6D4";
const C_GREY = "#334155";
const C_GREY_LIGHT = "#E2E8F0";
const C_BLUE_LIGHT = "#DBEAFE";
const C_GREEN = "#15803D";
const C_RED = "#B91C1C";
const C_AMBER = "#B45309";

const FALLBACK_DASH = "-";

function toRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

function dash(value: unknown): string {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : "\u2014";
}

function formatDateTime(value: unknown): string {
  if (!value) return "\u2014";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "\u2014";
  return format(date, "dd-MM-yyyy HH:mm");
}

function getColWidths(pageWidth: number): Record<number, { cellWidth: number }> {
  const margin = 10;
  const usable = pageWidth - margin * 2;
  // Normalized ratios that sum to 1.0 for 10 columns
  const ratios = [0.09, 0.08, 0.14, 0.10, 0.14, 0.12, 0.09, 0.07, 0.07, 0.10];
  const total = ratios.reduce((a, b) => a + b, 0);
  
  return ratios.reduce((acc, ratio, index) => {
    const normalized = ratio / total;
    const width = usable * normalized;
    acc[index] = { cellWidth: Math.round(width * 100) / 100 };
    return acc;
  }, {} as Record<number, { cellWidth: number }>);
}

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

  const normalizedRows = Array.isArray(report.reportRows)
    ? report.reportRows
    : [];

  if (!Array.isArray((session as any).scans)) {
    (session as any).scans = normalizedRows
      .filter((row: any) => row.feederNumber)
      .map((row: any, idx: number) => ({
        id: idx + 1,
        feederNumber: String(row.feederNumber),
        spoolBarcode: row.scannedValue,
        scannedMpn: row.scannedValue,
        partNumber: row.internalPartNumber,
        status: row.scanStatus === "verified" ? "ok" : row.scanStatus === "failed" ? "reject" : "duplicate",
        scannedAt: row.scannedAt,
      }));
  }

  if (!Array.isArray((report as any).bomItems)) {
    (report as any).bomItems = normalizedRows.map((row: any, idx: number) => ({
      id: idx + 1,
      feederNumber: row.feederNumber,
      location: row.referenceLocation,
      description: row.description,
      packageDescription: row.packageDescription,
      internalPartNumber: row.internalPartNumber,
      make1: row.make1,
      mpn1: row.mpn1,
      make2: row.make2,
      mpn2: row.mpn2,
      make3: row.make3,
      mpn3: row.mpn3,
    }));
  }

  const bestScanMap = new Map<string, typeof session.scans[0]>();
  for (const scan of session.scans) {
    const key = scan.feederNumber.toLowerCase();
    const existing = bestScanMap.get(key);
    if (!existing || scan.status === "ok" || new Date(scan.scannedAt) > new Date(existing.scannedAt)) {
      bestScanMap.set(key, scan);
    }
  }

  function buildExpectedMpn(scan: any): string {
    const parts: string[] = [];
    if (scan?.mpn1?.trim()) parts.push(scan.mpn1.trim());
    if (scan?.mpn2?.trim()) parts.push(scan.mpn2.trim());
    if (scan?.mpn3?.trim()) parts.push(scan.mpn3.trim());
    return parts.length > 0 ? parts.join(" / ") : scan?.internalPartNumber ?? "\u2014";
  }

  function buildMatchedAs(scan: any): string {
    if (scan?.matchedAs && String(scan.matchedAs).trim()) return String(scan.matchedAs);

    const field = String(scan?.matchedField ?? "").toLowerCase();
    if (field === "mpn1") return `MPN 1${scan?.make1 ? ` (${scan.make1})` : ""}`;
    if (field === "mpn2") return `MPN 2${scan?.make2 ? ` (${scan.make2})` : ""}`;
    if (field === "mpn3") return `MPN 3${scan?.make3 ? ` (${scan.make3})` : ""}`;
    if (field === "internalpartnumber") return "Internal P/N";
    return "\u2014";
  }

  const filteredScans = (latestOnly ? [...bestScanMap.values()] : session.scans).filter((s) => {
    if (s.status === "ok" && !showOk) return false;
    if (s.status === "reject" && !showReject) return false;
    return true;
  });

  const tableRows = normalizedRows.length > 0
    ? normalizedRows
    : (report.bomItems ?? []).map((item: any) => {
      const scan = bestScanMap.get(String(item.feederNumber ?? "").toLowerCase());
      return {
        feederNumber: item.feederNumber,
        referenceLocation: item.location,
        description: item.description,
        packageDescription: item.packageDescription,
        internalPartNumber: item.internalPartNumber,
        mpn1: item.mpn1,
        mpn2: item.mpn2,
        mpn3: item.mpn3,
        make1: item.make1,
        make2: item.make2,
        make3: item.make3,
        scannedValue: (scan as any)?.spoolBarcode ?? null,
        matchedAs: "\u2014",
        lotCode: null,
        scanStatus: scan?.status === "ok" ? "verified" : scan?.status === "reject" ? "failed" : "missing",
        scannedAt: scan?.scannedAt ?? null,
      };
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
    } catch (error) {
      console.warn("[SessionReport] Failed to load logo as data URL", error);
      return "";
    }
  };

  const exportPDF = async () => {
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 12;
      const changeoverId = String(session.id ?? "").padStart(8, "0");
      const verificationMode = String(session.verificationMode ?? "AUTO").toUpperCase() === "AUTO" ? "AUTO" : "MANUAL";

      const companyName = "UCAL FUEL SYSTEMS LIMITED";
      const reportTitle = "SMT CHANGEOVER VERIFICATION REPORT";

      // ===== SECTION 1: HEADER =====
      let currentY = margin;
      
      // Title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(...toRgb(C_NAVY));
      doc.text(reportTitle, pageWidth / 2, currentY + 4, { align: "center" });
      
      currentY += 7;
      doc.setFontSize(10);
      doc.text(companyName, pageWidth / 2, currentY, { align: "center" });

      // Right side: Changeover ID box
      const idBoxX = pageWidth - margin - 50;
      const idBoxY = margin + 1;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...toRgb(C_GREY_LIGHT));
      doc.setLineWidth(0.5);
      doc.rect(idBoxX, idBoxY, 45, 15, "FD");
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...toRgb(C_GREY));
      doc.text("Changeover ID", idBoxX + 22.5, idBoxY + 2, { align: "center" });
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...toRgb(C_NAVY));
      doc.text(changeoverId, idBoxX + 22.5, idBoxY + 7, { align: "center" });
      
      const modeColor = verificationMode === "AUTO" ? "#15803D" : "#B45309";
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...toRgb(modeColor));
      doc.text(`Mode: ${verificationMode} — STRICT`, idBoxX + 22.5, idBoxY + 12.5, { align: "center" });

      // Separator line
      currentY = margin + 19;
      doc.setDrawColor(...toRgb(C_NAVY));
      doc.setLineWidth(1);
      doc.line(margin, currentY, pageWidth - margin, currentY);

      // ===== SECTION 2: SESSION INFO GRID (3 rows × 5 columns) =====
      currentY += 3;
      
      const sessionInfoData = [
        [
          { label: "Changeover ID", value: changeoverId },
          { label: "Panel ID", value: dash(session.panelId) },
          { label: "Shift", value: dash(session.shift) },
          { label: "Date", value: session.startedAt ? format(new Date(session.startedAt), "dd-MMM-yyyy") : "—" },
          { label: "Duration", value: `${summary.durationMinutes || 0} min` },
        ],
        [
          { label: "Customer", value: dash(session.customer) },
          { label: "Machine", value: dash(session.machine) },
          { label: "Operator", value: dash(session.operatorName) },
          { label: "Start Time", value: session.startedAt ? format(new Date(session.startedAt), "HH:mm:ss") : "—" },
          { label: "BOM Version", value: dash(session.bomVersion) },
        ],
        [
          { label: "PCB / Part No.", value: dash(session.pcbPartNumber) },
          { label: "Line", value: dash(session.line) },
          { label: "QA Engineer", value: dash(session.qaName) },
          { label: "End Time", value: session.completedAt ? format(new Date(session.completedAt), "HH:mm:ss") : "—" },
          { label: "Supervisor", value: dash(session.supervisorName) },
        ],
      ];

      const colWidth = (pageWidth - margin * 2) / 5;
      sessionInfoData.forEach((row) => {
        let colX = margin;
        row.forEach((cell) => {
          doc.setDrawColor(...toRgb(C_GREY_LIGHT));
          doc.setLineWidth(0.2);
          doc.rect(colX, currentY, colWidth, 11);
          
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(...toRgb(C_GREY));
          doc.text(cell.label, colX + 1, currentY + 2);
          
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(...toRgb(C_NAVY));
          doc.text(cell.value, colX + 1, currentY + 6.5);
          
          colX += colWidth;
        });
        currentY += 11;
      });

      // ===== SECTION 3: COMPONENT VERIFICATION TABLE =====
      currentY += 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...toRgb(C_NAVY));
      doc.text("■ Component Verification Details", margin, currentY);
      currentY += 3;

      const verifyTableData = tableRows.map((row: any) => {
        const expectedMpns = [row.mpn1, row.mpn2, row.mpn3]
          .filter((v) => v && String(v).trim())
          .map((v) => String(v).trim());
        
        const expectedMpnText = expectedMpns.join("\n") || dash(row.internalPartNumber);
        
        let scannedSpoolText = row.scannedValue ?? "—";
        let matchedLabel = buildMatchedAs(row);
        
        if (String(row.matchedField ?? "").toLowerCase() === "mpn2" || String(row.matchedField ?? "").toLowerCase() === "mpn3") {
          scannedSpoolText += " ▲";
        }

        const status = String(row.scanStatus ?? "").toLowerCase() === "verified"
          ? "PASS"
          : String(row.scanStatus ?? "").toLowerCase() === "failed"
            ? "FAIL"
            : "MISSING";

        const lotCode = row.lotCode ?? "—";
        const scanTime = row.scannedAt ? format(new Date(row.scannedAt), "HH:mm:ss") : "—";

        return [
          row.feederNumber || "—",
          row.referenceLocation ?? "—",
          row.description || "—",
          row.description ? (row.description.match(/[\d.]+[a-zA-Z/]*/)?.[0] || "") : "—",
          row.packageDescription || "—",
          row.internalPartNumber || "—",
          expectedMpnText,
          scannedSpoolText,
          matchedLabel,
          lotCode,
          status,
          scanTime,
        ];
      });

      autoTable(doc, {
        startY: currentY,
        margin: { left: margin, right: margin, top: 2, bottom: 5 },
        theme: "grid",
        tableWidth: pageWidth - margin * 2,
        head: [[
          "Feeder No.",
          "Ref / Des",
          "Component\nDescription",
          "Value",
          "Pkg Size",
          "Internal Part No.\n(BOM)",
          "Expected MPN\n(BOM — valid options)",
          "Scanned Spool\n(Actual)",
          "Matched Field",
          "Lot Code",
          "Status",
          "Time",
        ]],
        body: verifyTableData,
        columnStyles: {
          0: { cellWidth: 14 },
          1: { cellWidth: 12 },
          2: { cellWidth: 16 },
          3: { cellWidth: 12 },
          4: { cellWidth: 10 },
          5: { cellWidth: 14 },
          6: { cellWidth: 18 },
          7: { cellWidth: 16 },
          8: { cellWidth: 16 },
          9: { cellWidth: 10 },
          10: { cellWidth: 10 },
          11: { cellWidth: 12 },
        },
        headStyles: {
          fillColor: toRgb(C_NAVY),
          textColor: toRgb(C_WHITE),
          fontStyle: "bold",
          fontSize: 7,
          cellPadding: 1,
          lineColor: toRgb(C_GREY_LIGHT),
          lineWidth: 0.2,
        },
        bodyStyles: {
          fontSize: 7,
          cellPadding: 1,
          textColor: toRgb(C_GREY),
          lineColor: toRgb(C_GREY_LIGHT),
          lineWidth: 0.2,
        },
        alternateRowStyles: {
          fillColor: toRgb(C_BLUE_LIGHT),
        },
        didParseCell: (hookData: any) => {
          if (hookData.section !== "body") return;
          
          // Color code Scanned Spool column (index 7)
          if (hookData.column.index === 7) {
            const matchedField = tableRows[hookData.row.index]?.matchedField;
            if (String(matchedField ?? "").toLowerCase() === "mpn1" || 
                String(matchedField ?? "").toLowerCase() === "internalpartnumber") {
              hookData.cell.styles.textColor = toRgb(C_GREEN);
              hookData.cell.styles.fontStyle = "bold";
            } else if (String(matchedField ?? "").toLowerCase() === "mpn2" || 
                       String(matchedField ?? "").toLowerCase() === "mpn3") {
              hookData.cell.styles.textColor = toRgb(C_AMBER);
              hookData.cell.styles.fontStyle = "bold";
            } else {
              hookData.cell.styles.textColor = toRgb(C_RED);
              hookData.cell.styles.fontStyle = "bold";
            }
          }
          
          // Color code Status column (index 10)
          if (hookData.column.index === 10) {
            if (hookData.cell.raw === "PASS") {
              hookData.cell.styles.textColor = toRgb(C_GREEN);
              hookData.cell.styles.fontStyle = "bold";
            } else if (hookData.cell.raw === "FAIL") {
              hookData.cell.styles.textColor = toRgb(C_RED);
              hookData.cell.styles.fontStyle = "bold";
            } else {
              hookData.cell.styles.textColor = toRgb(C_AMBER);
              hookData.cell.styles.fontStyle = "bold";
            }
          }
          
          // Color code Expected MPN column (index 6)
          if (hookData.column.index === 6) {
            hookData.cell.styles.textColor = toRgb("#1e40af");
          }
        },
      });

      currentY = (doc as any).lastAutoTable.finalY + 2;

      // Legend
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...toRgb(C_GREY));
      const legendText = "Legend — Scanned Spool column: Green = Primary MPN matched | Amber ▲ = Alternate MPN used (BOM-approved) | Red ✗ = Mismatch (scan rejected) | Blue text = Expected MPN options from BOM | AUTO STRICT: Exact match only — fuzzy matching disabled";
      doc.text(legendText, margin, currentY, { maxWidth: pageWidth - margin * 2 });

      // ===== SECTION 4: VERIFICATION SUMMARY =====
      currentY += 8;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...toRgb(C_NAVY));
      doc.text("■ Verification Summary", margin, currentY);
      currentY += 4;

      const passCount = tableRows.filter((r: any) => String(r.scanStatus ?? "").toLowerCase() === "verified").length;
      const failCount = tableRows.filter((r: any) => String(r.scanStatus ?? "").toLowerCase() === "failed").length;
      const warnCount = 0;
      const total = tableRows.length;
      const passRate = total > 0 ? ((passCount / total) * 100).toFixed(1) : "0.0";

      autoTable(doc, {
        startY: currentY,
        margin: { left: margin, right: margin },
        theme: "grid",
        tableWidth: pageWidth - margin * 2,
        head: [["Total Feeders", "PASS", "FAIL", "WARNING", "Pass Rate", "Status"]],
        body: [[String(total), String(passCount), String(failCount), String(warnCount), `${passRate}%`, failCount === 0 ? "COMPLETE" : "INCOMPLETE"]],
        columnStyles: {
          0: { cellWidth: 20 },
          1: { cellWidth: 20 },
          2: { cellWidth: 20 },
          3: { cellWidth: 20 },
          4: { cellWidth: 20 },
          5: { cellWidth: 20 },
        },
        headStyles: {
          fillColor: toRgb(C_NAVY),
          textColor: toRgb(C_WHITE),
          fontStyle: "bold",
          fontSize: 8,
          cellPadding: 2,
          lineColor: toRgb(C_GREY_LIGHT),
          lineWidth: 0.2,
        },
        bodyStyles: {
          fontSize: 9,
          fontStyle: "bold",
          cellPadding: 2,
          textColor: toRgb(C_GREY),
          lineColor: toRgb(C_GREY_LIGHT),
          lineWidth: 0.2,
        },
        didParseCell: (hookData: any) => {
          if (hookData.section !== "body") return;
          if (hookData.column.index === 1) hookData.cell.styles.textColor = toRgb(C_GREEN);
          if (hookData.column.index === 2) hookData.cell.styles.textColor = toRgb(C_RED);
          if (hookData.column.index === 3) hookData.cell.styles.textColor = toRgb(C_AMBER);
          if (hookData.column.index === 5) {
            hookData.cell.styles.textColor = String(hookData.cell.raw).includes("COMPLETE") ? toRgb(C_GREEN) : toRgb(C_RED);
          }
        },
      });

      // ===== SECTION 5: APPROVALS & SIGN-OFF =====
      currentY = (doc as any).lastAutoTable.finalY + 6;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...toRgb(C_NAVY));
      doc.text("■ Approvals & Sign-off", margin, currentY);
      currentY += 5;

      const approvalsData = [
        ["SUPERVISOR", dash(session.supervisorName)],
        ["OPERATOR", dash(session.operatorName)],
        ["QA ENGINEER", dash(session.qaName)],
        ["PRODUCTION MANAGER", "________________________"],
      ];

      const approvalColW = (pageWidth - margin * 2) / 4;
      approvalsData.forEach((cell, idx) => {
        const xPos = margin + idx * approvalColW;
        
        doc.setFillColor(...toRgb(C_NAVY));
        doc.setDrawColor(...toRgb(C_NAVY));
        doc.rect(xPos + 2, currentY, approvalColW - 4, 4, "FD");
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...toRgb(C_WHITE));
        doc.text(cell[0], xPos + approvalColW / 2, currentY + 2.5, { align: "center" });
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...toRgb(C_GREY));
        doc.text(cell[1], xPos + approvalColW / 2, currentY + 8, { align: "center" });
        
        doc.setDrawColor(...toRgb(C_GREY_LIGHT));
        doc.setLineWidth(0.3);
        doc.line(xPos + 5, currentY + 12, xPos + approvalColW - 5, currentY + 12);
        
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7);
        doc.setTextColor(...toRgb(C_GREY));
        doc.text("Name / Signature / Date", xPos + approvalColW / 2, currentY + 15, { align: "center" });
      });

      // ===== SECTION 6: FOOTER =====
      const footerY = pageHeight - 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...toRgb(C_GREY));
      const footerText = `SMTVerification System — Electronically Generated Report | Changeover: CHG${changeoverId} | Date: ${format(new Date(session.startedAt || new Date()), "dd-MMM-yyyy")} | BOM: ${dash(session.bomVersion)} | Mode: ${verificationMode} — STRICT | This document is valid without physical signature when QR-verified.`;
      doc.text(footerText, margin, footerY, { maxWidth: pageWidth - margin * 2 });

      doc.save(`smt-changeover-report-${session.id}.pdf`);
    } catch (error) {
      console.error("PDF generation failed", error);
      alert("Failed to generate PDF. Please check the console for details.");
    }
  };

  const exportExcel = async () => {
    try {
      // Excel export is handled by backend API for security
      const response = await fetch(`/api/reports/export/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: "xlsx",
          sessionId: session.id,
          title: `${appConfig.systemTitle} - ${session.id}`,
          includeSplices: showSplices,
        }),
      });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `smt-changeover-report-${session.id}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Excel export error:", error);
      alert("Failed to generate Excel. Please check the console for details.");
    }
  };

  const passCount = [...bestScanMap.values()].filter((s) => s.status === "ok").length;
  const failCount = [...bestScanMap.values()].filter((s) => s.status === "reject").length;
  const isComplete = passCount === report.bomItems.length;
  
  // Detect Free Scan Mode
  const isFreeScanMode = session.bomId === null || session.bomId === undefined;

  return (
    <div className="w-full space-y-4 sm:space-y-6 px-3 sm:px-6 py-3 sm:py-6 max-w-6xl mx-auto">
      {/* Header - Responsive */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 sm:gap-4 border-b border-border pb-3 sm:pb-4">
        <div className="flex flex-col sm:flex-row items-start gap-2 sm:gap-4 min-w-0">
          <AppLogo className="h-10 sm:h-14 lg:h-16 w-auto object-contain flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-mono font-bold tracking-tight">{appConfig.systemTitle}</h1>
            <h2 className="text-lg sm:text-xl lg:text-2xl font-mono font-bold tracking-tight text-primary">REPORT</h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 font-mono truncate">
              {String(session.id)} | {session.companyName}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-start sm:justify-end w-full sm:w-auto">
          <Button onClick={() => setShowCustomize(!showCustomize)} variant="outline" className="font-mono rounded-sm text-xs sm:text-sm py-1 sm:py-2 px-2 sm:px-3 h-auto">
            <Settings2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" /> <span className="hidden sm:inline">Customize</span><span className="sm:hidden">Customize</span>
          </Button>
          <Button
            onClick={() => window.open(`/api/sessions/${sessionId}/report/pdf`, "_blank")}
            variant="secondary"
            className="font-mono rounded-sm text-xs sm:text-sm py-1 sm:py-2 px-2 sm:px-3 h-auto"
            data-testid="btn-export-pdf"
          >
            <FileText className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" /> <span className="hidden sm:inline">PDF</span>
          </Button>
          <Button onClick={() => exportExcel()} variant="secondary" className="font-mono rounded-sm text-xs sm:text-sm py-1 sm:py-2 px-2 sm:px-3 h-auto" data-testid="btn-export-excel">
            <Download className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" /> <span className="hidden sm:inline">EXCEL</span>
          </Button>
        </div>
      </div>

      {/* Customize Panel - Responsive Grid */}
      {showCustomize && (
        <div className="bg-card border border-border p-3 sm:p-5 rounded-sm font-mono">
          <h3 className="font-bold text-xs tracking-wider text-muted-foreground mb-3 sm:mb-4">CUSTOMIZATION</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 lg:gap-4">
            <div className="flex items-center gap-2">
              <Checkbox id="chk-ok" checked={showOk} onCheckedChange={(v) => setShowOk(Boolean(v))} />
              <Label htmlFor="chk-ok" className="cursor-pointer text-success font-bold text-xs sm:text-sm">PASS</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="chk-rej" checked={showReject} onCheckedChange={(v) => setShowReject(Boolean(v))} />
              <Label htmlFor="chk-rej" className="cursor-pointer text-destructive font-bold text-xs sm:text-sm">FAIL</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="chk-spool" checked={showSpoolBarcode} onCheckedChange={(v) => setShowSpoolBarcode(Boolean(v))} />
              <Label htmlFor="chk-spool" className="cursor-pointer text-xs sm:text-sm">Spool</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="chk-splice" checked={showSplices} onCheckedChange={(v) => setShowSplices(Boolean(v))} />
              <Label htmlFor="chk-splice" className="cursor-pointer text-amber-600 font-bold text-xs sm:text-sm">Splices</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="chk-alternates" checked={showAlternates} onCheckedChange={(v) => setShowAlternates(Boolean(v))} />
              <Label htmlFor="chk-alternates" className="cursor-pointer text-orange-600 font-bold text-xs sm:text-sm">Alts</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="chk-latest" checked={latestOnly} onCheckedChange={(v) => setLatestOnly(Boolean(v))} />
              <Label htmlFor="chk-latest" className="cursor-pointer text-xs sm:text-sm">Latest</Label>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2 sm:mt-3">
            Showing <strong>{filteredScans.length}</strong> / {session.scans.length} records
          </p>
        </div>
      )}

      {/* Session Info Grid - Responsive */}
      <div className="bg-card border border-border p-3 sm:p-6 rounded-sm font-mono text-xs sm:text-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-start justify-between mb-3 sm:mb-4 gap-3">
          <div>
            {session.logoUrl && <img src={session.logoUrl} alt="Logo" className="h-8 sm:h-12 object-contain mb-2" />}
            <div className="text-lg sm:text-xl font-black text-foreground truncate">{session.companyName}</div>
          </div>
          <div className={`px-2 sm:px-4 py-1 sm:py-2 border-2 uppercase font-bold tracking-widest text-xs sm:text-base whitespace-nowrap ${session.status === "completed" ? "border-success text-success" : "border-primary text-primary"}`}>
            {session.status}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-2 sm:gap-x-4 lg:gap-x-8 gap-y-2 sm:gap-y-3 text-xs">
          <div><span className="font-bold text-muted-foreground">ID:</span> <span className="truncate">{String(session.id)}</span></div>
          <div><span className="font-bold text-muted-foreground">Panel:</span> <span className="truncate">{session.panelName}</span></div>
          <div><span className="font-bold text-muted-foreground">Shift:</span> <span className="truncate">{session.shiftName}</span></div>
          <div><span className="font-bold text-muted-foreground">Date:</span> <span className="truncate">{session.shiftDate}</span></div>
          <div><span className="font-bold text-muted-foreground">Machine:</span> <span className="truncate">ML-001</span></div>
          <div><span className="font-bold text-muted-foreground">Line:</span> <span className="truncate">PRIMARY</span></div>
          <div><span className="font-bold text-muted-foreground">Cust:</span> <span className="truncate">{session.customerName || "N/A"}</span></div>
          <div><span className="font-bold text-muted-foreground">Op:</span> <span className="truncate">{session.operatorName}</span></div>
          <div><span className="font-bold text-muted-foreground">Sup:</span> <span className="truncate">{session.supervisorName}</span></div>
          <div><span className="font-bold text-muted-foreground">BOM:</span> <span className={`truncate ${isFreeScanMode ? "text-amber-600 font-bold" : ""}`}>{session.bomName || (isFreeScanMode ? "FREE SCAN" : "N/A")}</span></div>
          <div><span className="font-bold text-muted-foreground">Start:</span> <span className="truncate">{session.startTime ? format(new Date(session.startTime), "HH:mm:ss") : "N/A"}</span></div>
          <div><span className="font-bold text-muted-foreground">End:</span> <span className="truncate">{session.endTime ? format(new Date(session.endTime), "HH:mm:ss") : "N/A"}</span></div>
          <div><span className="font-bold text-muted-foreground">Dur:</span> <span className="truncate">{summary.durationMinutes || 0}m</span></div>
          <div><span className="font-bold text-muted-foreground">QA:</span> <span className="truncate">{session.qaName || "N/A"}</span></div>
        </div>
      </div>

      {/* KPI Cards - Responsive Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          { label: "FEEDERS", value: summary.totalBomItems, color: "text-foreground" },
          { label: "PASS", value: passCount, color: "text-success" },
          { label: "FAIL", value: failCount, color: "text-destructive" },
          { label: "WARN", value: 0, color: "text-amber-500" },
          { label: "RATE", value: `${summary.completionPercent}%`, color: "text-primary" },
          { label: "STATUS", value: isComplete ? "OK" : "INCOMPLETE", color: isComplete ? "text-success" : "text-destructive" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-card border border-border p-2 sm:p-3 rounded-sm text-center">
            <div className="text-muted-foreground font-mono text-[10px] sm:text-xs mb-1 truncate">{label}</div>
            <div className={`text-base sm:text-lg lg:text-xl font-mono font-black ${color} truncate`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Component Verification Details Table - Responsive */}
      <div className="bg-card border border-border rounded-sm overflow-hidden">
        <div className="p-2 sm:p-3 border-b border-border font-mono font-bold text-xs sm:text-sm flex items-center gap-2" style={{ backgroundColor: "rgb(0,51,102)", color: "white" }}>
          {isFreeScanMode ? "All Scan Records" : "Component Verification Details"}
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow style={{ backgroundColor: "rgb(0,51,102)" }} className="hover:bg-transparent border-0">
                {isFreeScanMode ? (
                  <>
                    <TableHead className="font-mono font-bold text-white text-center border-r border-blue-800 text-xs sm:text-sm p-2 sm:p-3">Time</TableHead>
                    <TableHead className="font-mono font-bold text-white text-center border-r border-blue-800 text-xs sm:text-sm p-2 sm:p-3">Feeder No.</TableHead>
                    {showSpoolBarcode && <TableHead className="font-mono font-bold text-white text-center border-r border-blue-800 text-xs sm:text-sm p-2 sm:p-3">Spool Barcode</TableHead>}
                    <TableHead className="font-mono font-bold text-white text-center border-r border-blue-800 text-xs sm:text-sm p-2 sm:p-3">Part Number</TableHead>
                    <TableHead className="font-mono font-bold text-white text-center border-r border-blue-800 text-xs sm:text-sm p-2 sm:p-3">Status</TableHead>
                  </>
                ) : (
                  <>
                    {["Feeder No.", "Ref / Des", "Component", "Expected MPN", showSpoolBarcode ? "Scanned Spool" : null, "Matched As", "Lot", "Status", "Time"]
                      .filter(Boolean).map((h) => (
                      <TableHead key={h} className="font-mono font-bold text-white text-center border-r border-blue-800 last:border-0 text-xs sm:text-sm p-2 sm:p-3">{h}</TableHead>
                    ))}
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isFreeScanMode ? (
                session.scans.length === 0 ? (
                  <TableRow><TableCell colSpan={showSpoolBarcode ? 5 : 4} className="text-center py-6 sm:py-8 text-muted-foreground text-xs sm:text-sm">No scans recorded</TableCell></TableRow>
                ) : (
                  session.scans.map((scan, idx) => (
                    <TableRow key={scan.id} className={idx % 2 === 1 ? "bg-blue-50 dark:bg-blue-950/20" : ""}>
                      <TableCell className="font-mono text-center text-muted-foreground text-xs p-2 sm:p-3">{format(new Date(scan.scannedAt), "HH:mm:ss")}</TableCell>
                      <TableCell className="font-mono font-bold text-center text-xs sm:text-sm p-2 sm:p-3">{scan.feederNumber}</TableCell>
                      {showSpoolBarcode && <TableCell className="font-mono text-center text-muted-foreground text-xs p-2 sm:p-3">{(scan as any)?.spoolBarcode || "-"}</TableCell>}
                      <TableCell className="font-mono text-center text-muted-foreground text-xs p-2 sm:p-3">{scan.partNumber || "-"}</TableCell>
                      <TableCell className={`font-mono font-black text-center text-xs sm:text-sm p-2 sm:p-3 ${scan.status === "ok" ? "text-success" : "text-destructive"}`}>{scan.status === "ok" ? "PASS" : "FAIL"}</TableCell>
                    </TableRow>
                  ))
                )
              ) : (
                tableRows.length === 0 ? (
                  <TableRow><TableCell colSpan={showSpoolBarcode ? 9 : 8} className="text-center py-6 sm:py-8 text-muted-foreground text-xs sm:text-sm">No BOM items</TableCell></TableRow>
                ) : (
                  tableRows.map((scan: any, idx: number) => {
                    const status = String(scan.scanStatus ?? "").toLowerCase() === "verified"
                      ? "PASS"
                      : String(scan.scanStatus ?? "").toLowerCase() === "failed"
                        ? "FAIL"
                        : "MISSING";
                    const matchedAs = buildMatchedAs(scan);
                    const scannedSpoolClass = matchedAs.includes("MPN 1") || matchedAs.includes("Primary")
                      ? "text-green-600 font-semibold"
                      : matchedAs.includes("MPN 2") || matchedAs.includes("MPN 3")
                        ? "text-amber-600 font-semibold"
                        : "text-red-600 font-semibold";

                    return (
                      <TableRow key={`${scan.feederNumber}-${idx}`} className={idx % 2 === 1 ? "bg-blue-50 dark:bg-blue-950/20" : ""}>
                        <TableCell className="font-mono font-bold text-center text-xs sm:text-sm p-2 sm:p-3">{scan.feederNumber}</TableCell>
                        <TableCell className="font-mono text-center text-xs p-2 sm:p-3">{scan.referenceLocation ?? "\u2014"}</TableCell>
                        <TableCell className="font-mono text-center text-xs sm:text-sm p-2 sm:p-3">{scan.description ?? "\u2014"}</TableCell>
                        <TableCell className="font-mono text-blue-600 text-xs sm:text-sm p-2 sm:p-3 truncate">{buildExpectedMpn(scan)}</TableCell>
                        {showSpoolBarcode && <TableCell className={`font-mono text-center text-xs p-2 sm:p-3 truncate ${scannedSpoolClass}`}>{scan.scannedValue ?? "\u2014"}</TableCell>}
                        <TableCell className="font-mono text-center text-xs p-2 sm:p-3">{matchedAs}</TableCell>
                        <TableCell className="font-mono text-center text-muted-foreground text-xs p-2 sm:p-3">{scan.lotCode ?? "\u2014"}</TableCell>
                        <TableCell className={`font-mono font-black text-center text-xs sm:text-sm p-2 sm:p-3 ${status === "PASS" ? "text-success" : status === "FAIL" ? "text-destructive" : "text-amber-600"}`}>{status}</TableCell>
                        <TableCell className="font-mono text-center text-muted-foreground text-xs p-2 sm:p-3">{scan.scannedAt ? format(new Date(scan.scannedAt), "HH:mm:ss") : "\u2014"}</TableCell>
                      </TableRow>
                    );
                  })
                )
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
