// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@workspace/db";
import { auditLogsTable, InsertAuditLog } from "@workspace/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";

export class AuditService {
  /**
   * Record an audit log entry
   */
  static async recordAuditLog(data: InsertAuditLog) {
    // @ts-ignore - Drizzle insert type inference issue
    const result = (await db
      .insert(auditLogsTable)
      .values(data)
      .returning()) as any[];
    return result[0];
  }

  /**
   * Get audit logs for a specific entity
   */
  static async getAuditLogsForEntity(entityType: string, entityId: string) {
    // @ts-ignore - Drizzle select type inference issue
    const logs: any[] = await db
      .select()
      .from(auditLogsTable)
      .where(
        and(
          eq(auditLogsTable.entityType, entityType),
          eq(auditLogsTable.entityId, entityId)
        )
      )
      .orderBy(auditLogsTable.createdAt);

    return logs;
  }

  /**
   * Get audit logs for a specific action type
   */
  static async getAuditLogsByAction(action: string, limit: number = 100) {
    // @ts-ignore - Drizzle select type inference issue
    const logs: any[] = await db
      .select()
      .from(auditLogsTable)
      .where(eq(auditLogsTable.action, action))
      .limit(limit)
      .orderBy(auditLogsTable.createdAt);

    return logs;
  }

  /**
   * Get audit logs by user
   */
  static async getAuditLogsByUser(userId: string, limit: number = 100) {
    // @ts-ignore - Drizzle select type inference issue  
    const logs: any[] = await db
      .select()
      .from(auditLogsTable)
      .where(eq(auditLogsTable.changedBy, userId))
      .limit(limit)
      .orderBy(auditLogsTable.createdAt);

    return logs;
  }

  /**
   * Get audit logs within a date range
   */
  static async getAuditLogsByDateRange(
    startDate: Date,
    endDate: Date,
    limit: number = 1000
  ) {
    // @ts-ignore - Drizzle select type inference issue
    const logs: any[] = await db
      .select()
      .from(auditLogsTable)
      .where(
        and(
          gte(auditLogsTable.createdAt, startDate),
          lte(auditLogsTable.createdAt, endDate)
        )
      )
      .limit(limit)
      .orderBy(auditLogsTable.createdAt);

    return logs;
  }

  /**
   * Get change history for an entity
   */
  static async getChangeHistory(entityType: string, entityId: string) {
    // @ts-ignore - Drizzle select type inference issue
    const logs: any[] = await db
      .select()
      .from(auditLogsTable)
      .where(
        and(
          eq(auditLogsTable.entityType, entityType),
          eq(auditLogsTable.entityId, entityId)
        )
      )
      .orderBy(auditLogsTable.createdAt);

    const history = logs.map((log) => ({
      timestamp: log.createdAt,
      action: log.action,
      oldValue: log.oldValue ? JSON.parse(log.oldValue) : null,
      newValue: log.newValue ? JSON.parse(log.newValue) : null,
      changedBy: log.changedBy,
      description: log.description,
    }));

    return history;
  }

  /**
   * Get all entity changes with before/after comparison
   */
  static async getEntityDiff(
    entityType: string,
    entityId: string
  ): Promise<Array<{ action: string; timestamp: Date; before: any; after: any; changedBy: string | null }>> {
    const logs = await this.getAuditLogsForEntity(entityType, entityId);

    return logs.map((log) => ({
      action: log.action,
      timestamp: log.createdAt,
      before: log.oldValue ? JSON.parse(log.oldValue) : null,
      after: log.newValue ? JSON.parse(log.newValue) : null,
      changedBy: log.changedBy,
    }));
  }
}
