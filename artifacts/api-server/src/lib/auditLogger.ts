type AuditEvent =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILURE"
  | "LOGOUT"
  | "SCAN_VERIFIED"
  | "SCAN_REJECTED"
  | "SCAN_DUPLICATE"
  | "SESSION_STARTED"
  | "SESSION_COMPLETED"
  | "SPLICE_RECORDED"
  | "UNAUTHORIZED_ACCESS"
  | "BOM_IMPORTED";

import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db/schema";
import { TimestampService } from "../services/timestamp-service";

interface AuditLog {
  event: AuditEvent;
  operatorId?: number;
  sessionId?: number;
  detail?: string;
  ip?: string;
  timestamp: string;
}

export async function auditLog(entry: Omit<AuditLog, "timestamp">) {
  const log: AuditLog = {
    ...entry,
    timestamp: new Date().toISOString(),
  };

  try {
    await db.insert(auditLogsTable).values({
      entityType: "security_event",
      entityId: log.sessionId != null ? String(log.sessionId) : log.event,
      action: log.event,
      oldValue: null,
      newValue: JSON.stringify({
        detail: log.detail ?? null,
        ip: log.ip ?? null,
        timestamp: log.timestamp,
      }),
      changedBy: log.operatorId != null ? String(log.operatorId) : null,
      description: log.detail ?? log.event,
      createdAt: TimestampService.createAuditTimestamp(),
    });
  } catch (error) {
    console.warn("[AuditLogger] Failed to persist audit event", error);
  }

  console.log(JSON.stringify({ audit: true, ...log }));
}