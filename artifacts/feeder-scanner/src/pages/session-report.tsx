import { useRoute } from "wouter";
import { useGetSessionReport } from "@workspace/api-client-react";
import { getGetSessionReportQueryKey } from "@workspace/api-client-react";
import { Loader2, Download, FileText, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export default function SessionReport() {
  const [, params] = useRoute("/session/:id/report");
  const sessionId = Number(params?.id);

  const { data: report, isLoading } = useGetSessionReport(sessionId, { query: { enabled: !!sessionId, queryKey: getGetSessionReportQueryKey(sessionId) } });

  const exportPDF = () => {
    if (!report) return;
    const doc = new jsPDF();
    const { session, summary } = report;

    doc.setFontSize(18);
    doc.text("SMT FEEDER VERIFICATION REPORT", 14, 22);
    
    doc.setFontSize(11);
    doc.text(`Panel: ${session.panelName}`, 14, 32);
    doc.text(`Company: ${session.companyName}`, 14, 38);
    doc.text(`BOM: ${session.bomName || session.bomId}`, 100, 32);
    doc.text(`Date: ${format(new Date(session.startTime), 'yyyy-MM-dd')}`, 100, 38);

    autoTable(doc, {
      startY: 45,
      head: [['Metric', 'Value']],
      body: [
        ['Status', session.status],
        ['Duration (min)', summary.durationMinutes?.toString() || '-'],
        ['Total BOM Items', summary.totalBomItems.toString()],
        ['Items Scanned', summary.scannedCount.toString()],
        ['Completion', `${summary.completionPercent}%`],
        ['OK Scans', summary.okCount.toString()],
        ['Reject Scans', summary.rejectCount.toString()],
        ['Missing Items', summary.missingCount.toString()],
      ],
      theme: 'grid',
    });

    const finalY = (doc as any).lastAutoTable.finalY || 45;
    
    doc.text("SCAN LOG", 14, finalY + 10);
    
    const logBody = session.scans.map(s => [
      format(new Date(s.scannedAt), 'HH:mm:ss'),
      s.feederNumber,
      s.partNumber || '',
      s.status.toUpperCase()
    ]);

    autoTable(doc, {
      startY: finalY + 15,
      head: [['Time', 'Feeder', 'Part', 'Status']],
      body: logBody,
      theme: 'striped',
    });

    doc.save(`smt-report-${session.id}.pdf`);
  };

  const exportExcel = () => {
    if (!report) return;
    const { session, summary } = report;

    const summarySheet = XLSX.utils.json_to_sheet([
      { Metric: "Session ID", Value: session.id },
      { Metric: "Panel", Value: session.panelName },
      { Metric: "BOM", Value: session.bomName || session.bomId },
      { Metric: "Status", Value: session.status },
      { Metric: "Duration (min)", Value: summary.durationMinutes },
      { Metric: "Total BOM Items", Value: summary.totalBomItems },
      { Metric: "Completion %", Value: summary.completionPercent },
      { Metric: "OK Scans", Value: summary.okCount },
      { Metric: "Reject Scans", Value: summary.rejectCount }
    ]);

    const scansSheet = XLSX.utils.json_to_sheet(
      session.scans.map(s => ({
        Time: format(new Date(s.scannedAt), 'yyyy-MM-dd HH:mm:ss'),
        Feeder: s.feederNumber,
        Part: s.partNumber,
        Status: s.status.toUpperCase()
      }))
    );

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");
    XLSX.utils.book_append_sheet(wb, scansSheet, "Scans");

    XLSX.writeFile(wb, `smt-report-${session.id}.xlsx`);
  };

  if (isLoading || !report) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  const { session, summary } = report;

  return (
    <div className="p-8 max-w-5xl mx-auto w-full space-y-8">
      <div className="flex justify-between items-end border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-mono font-bold tracking-tight text-foreground">SESSION REPORT</h1>
          <p className="text-muted-foreground mt-2 font-mono">ID: {session.id} | {format(new Date(session.startTime), "PPpp")}</p>
        </div>
        <div className="flex gap-4">
          <Button onClick={exportPDF} variant="secondary" className="font-mono rounded-sm" data-testid="btn-export-pdf">
            <FileText className="w-4 h-4 mr-2" /> PDF
          </Button>
          <Button onClick={exportExcel} variant="secondary" className="font-mono rounded-sm" data-testid="btn-export-excel">
            <Download className="w-4 h-4 mr-2" /> EXCEL
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border p-8 rounded-sm font-mono text-sm grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <div className="col-span-full mb-4 flex items-center justify-between">
          {session.logoUrl && <img src={session.logoUrl} alt="Company Logo" className="h-12 object-contain" />}
          <div className={`px-4 py-2 border-2 uppercase font-bold tracking-widest ${session.status === 'completed' ? 'border-success text-success' : 'border-primary text-primary'}`}>
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
          <div className="text-success font-mono text-xs mb-2 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> OK</div>
          <div className="text-3xl font-mono font-bold text-success">{summary.okCount}</div>
        </div>
        <div className="bg-card border border-border p-4 rounded-sm flex flex-col items-center justify-center text-center border-b-4 border-b-destructive">
          <div className="text-destructive font-mono text-xs mb-2 flex items-center gap-1"><AlertCircle className="w-3 h-3"/> REJECT</div>
          <div className="text-3xl font-mono font-bold text-destructive">{summary.rejectCount}</div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-sm overflow-hidden flex flex-col">
        <div className="bg-secondary/50 p-3 border-b border-border font-mono font-bold">
          FULL SCAN LOG
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="font-mono">TIME</TableHead>
                <TableHead className="font-mono">FEEDER</TableHead>
                <TableHead className="font-mono">PART</TableHead>
                <TableHead className="font-mono">STATUS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {session.scans.length === 0 ? (
                <TableRow className="border-border">
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground font-mono">No scans recorded</TableCell>
                </TableRow>
              ) : (
                session.scans.map(scan => (
                  <TableRow key={scan.id} className="border-border">
                    <TableCell className="font-mono text-muted-foreground">{format(new Date(scan.scannedAt), "HH:mm:ss")}</TableCell>
                    <TableCell className="font-mono font-bold">{scan.feederNumber}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">{scan.partNumber || "-"}</TableCell>
                    <TableCell className={`font-mono font-bold uppercase ${scan.status === 'ok' ? 'text-success' : 'text-destructive'}`}>
                      {scan.status}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
