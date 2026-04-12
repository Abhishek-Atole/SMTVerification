import { AlertCircle, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface ValidationFeedback {
  status: "pass" | "mismatch" | "alternate_pass" | "error";
  feederNumber: string;
  expectedMpn?: string;
  scannedMpn?: string;
  lotNumber?: string;
  dateCode?: string;
  reelId?: string;
  alternateUsed?: boolean;
  message: string;
  durationMs?: number;
  timestamp: Date;
}

interface ScanResultDisplayProps {
  feedback: ValidationFeedback;
}

export function ScanResultDisplay({ feedback }: ScanResultDisplayProps) {
  const getIcon = () => {
    switch (feedback.status) {
      case "pass":
        return <CheckCircle2 className="w-6 h-6 text-green-600" />;
      case "alternate_pass":
        return <AlertTriangle className="w-6 h-6 text-amber-600" />;
      case "mismatch":
        return <AlertCircle className="w-6 h-6 text-red-600" />;
      case "error":
        return <AlertCircle className="w-6 h-6 text-red-600" />;
    }
  };

  const getBackgroundColor = () => {
    switch (feedback.status) {
      case "pass":
        return "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900";
      case "alternate_pass":
        return "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900";
      case "mismatch":
      case "error":
        return "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900";
    }
  };

  const getStatusBadgeColor = () => {
    switch (feedback.status) {
      case "pass":
        return "bg-green-600";
      case "alternate_pass":
        return "bg-amber-600";
      case "mismatch":
      case "error":
        return "bg-red-600";
    }
  };

  const getStatusLabel = () => {
    switch (feedback.status) {
      case "pass":
        return "PASS";
      case "alternate_pass":
        return "ALTERNATE";
      case "mismatch":
        return "MISMATCH";
      case "error":
        return "ERROR";
    }
  };

  return (
    <Card className={`border-2 ${getBackgroundColor()}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getIcon()}
            <CardTitle className="text-lg">
              Feeder {feedback.feederNumber}
            </CardTitle>
          </div>
          <Badge className={`${getStatusBadgeColor()} text-white font-bold tracking-wider`}>
            {getStatusLabel()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm font-medium">{feedback.message}</p>

        {/* Component Details */}
        <div className="grid grid-cols-2 gap-3 text-xs bg-background/50 p-3 rounded">
          {feedback.expectedMpn && (
            <div>
              <span className="text-muted-foreground">Expected MPN:</span>
              <div className="font-mono font-bold">{feedback.expectedMpn}</div>
            </div>
          )}
          {feedback.scannedMpn && (
            <div>
              <span className="text-muted-foreground">Scanned MPN:</span>
              <div className="font-mono font-bold">{feedback.scannedMpn}</div>
            </div>
          )}
          {feedback.lotNumber && (
            <div>
              <span className="text-muted-foreground">Lot Number:</span>
              <div className="font-mono">{feedback.lotNumber}</div>
            </div>
          )}
          {feedback.dateCode && (
            <div>
              <span className="text-muted-foreground">Date Code:</span>
              <div className="font-mono">{feedback.dateCode}</div>
            </div>
          )}
          {feedback.reelId && (
            <div>
              <span className="text-muted-foreground">Reel ID:</span>
              <div className="font-mono">{feedback.reelId}</div>
            </div>
          )}
          {feedback.durationMs && (
            <div>
              <span className="text-muted-foreground">Duration:</span>
              <div className="font-mono">
                {feedback.durationMs < 1000
                  ? `${feedback.durationMs}ms`
                  : `${(feedback.durationMs / 1000).toFixed(1)}s`}
              </div>
            </div>
          )}
        </div>

        {/* Timestamp */}
        <div className="text-xs text-muted-foreground">
          {feedback.timestamp.toLocaleTimeString()}
        </div>
      </CardContent>
    </Card>
  );
}

interface ScanHistoryProps {
  entries: ValidationFeedback[];
  maxDisplay?: number;
}

export function ScanHistory({ entries, maxDisplay = 5 }: ScanHistoryProps) {
  const displayed = entries.slice(0, maxDisplay);

  return (
    <div className="space-y-2">
      {displayed.map((entry, idx) => (
        <ScanResultDisplay key={idx} feedback={entry} />
      ))}
    </div>
  );
}

interface SessionStatsProps {
  totalScans: number;
  passScans: number;
  alternateScans: number;
  mismatchScans: number;
  uniqueFeeders: number;
  totalBomItems: number;
}

export function SessionStats({
  totalScans,
  passScans,
  alternateScans,
  mismatchScans,
  uniqueFeeders,
  totalBomItems,
}: SessionStatsProps) {
  const passRate = totalScans > 0 ? ((passScans + alternateScans) / totalScans * 100).toFixed(1) : 0;
  const progress = Math.round((uniqueFeeders / totalBomItems) * 100);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">Total Scans</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalScans}</div>
        </CardContent>
      </Card>

      <Card className="border-green-600">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-green-700 dark:text-green-400">Pass</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">{passScans}</div>
        </CardContent>
      </Card>

      <Card className="border-amber-600">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-amber-700 dark:text-amber-400">
            Alternate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-amber-600">{alternateScans}</div>
        </CardContent>
      </Card>

      <Card className="border-red-600">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-red-700 dark:text-red-400">
            Mismatch
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600">{mismatchScans}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            Pass Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{passRate}%</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {uniqueFeeders}/{totalBomItems}
          </div>
          <div className="text-xs text-muted-foreground mt-1">{progress}%</div>
        </CardContent>
      </Card>
    </div>
  );
}
