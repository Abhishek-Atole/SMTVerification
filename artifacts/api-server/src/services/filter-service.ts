/* eslint-disable @typescript-eslint/no-explicit-any */
import { sql, and, gte, lte, eq, inArray, like } from "drizzle-orm";

/**
 * FilterService - Utility for building database queries with common filters
 */
export class FilterService {
  /**
   * Parse a date filter string and return { startDate, endDate }
   * @example 'today' -> { startDate: Date, endDate: Date }
   * @example 'last7' -> { startDate: Date, endDate: Date }
   * @example { start: '2026-04-01', end: '2026-04-20' } -> { startDate: Date, endDate: Date }
   */
  static parseDateFilter(filter: "today" | "yesterday" | "last7" | "last30" | { start: string; end: string }): {
    startDate: Date;
    endDate: Date;
  } {
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);

    if (filter === "today") {
      const endDate = new Date(now);
      endDate.setUTCHours(23, 59, 59, 999);
      return { startDate: now, endDate };
    }

    if (filter === "yesterday") {
      const startDate = new Date(now);
      startDate.setUTCDate(startDate.getUTCDate() - 1);
      const endDate = new Date(startDate);
      endDate.setUTCHours(23, 59, 59, 999);
      return { startDate, endDate };
    }

    if (filter === "last7") {
      const startDate = new Date(now);
      startDate.setUTCDate(startDate.getUTCDate() - 7);
      const endDate = new Date(now);
      endDate.setUTCHours(23, 59, 59, 999);
      return { startDate, endDate };
    }

    if (filter === "last30") {
      const startDate = new Date(now);
      startDate.setUTCDate(startDate.getUTCDate() - 30);
      const endDate = new Date(now);
      endDate.setUTCHours(23, 59, 59, 999);
      return { startDate, endDate };
    }

    // Custom date range
    const startDate = new Date(filter.start);
    startDate.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(filter.end);
    endDate.setUTCHours(23, 59, 59, 999);
    return { startDate, endDate };
  }

  /**
   * Build date range WHERE clause for scan_records
   */
  static buildDateWhereClause(
    scanRecordsTable: any,
    dateRange: { startDate: Date; endDate: Date }
  ): any {
    return and(
      gte(scanRecordsTable.scannedAt, dateRange.startDate),
      lte(scanRecordsTable.scannedAt, dateRange.endDate)
    );
  }

  /**
   * Build WHERE clause for sessions table with date range
   */
  static buildSessionDateWhereClause(
    sessionsTable: any,
    dateRange: { startDate: Date; endDate: Date }
  ): any {
    return and(
      gte(sessionsTable.startTime, dateRange.startDate),
      lte(sessionsTable.startTime, dateRange.endDate)
    );
  }

  /**
   * Validate and parse query filters (basic validation without Zod)
   */
  static validateFilters(filters: any): {
    dateFilter: "today" | "yesterday" | "last7" | "last30" | { start: string; end: string };
    lineId?: string;
    pcbId?: string;
    operatorId?: string;
    shiftId?: string;
  } {
    const dateFilter = filters.dateFilter || "today";
    if (!["today", "yesterday", "last7", "last30"].includes(dateFilter) && typeof dateFilter !== "object") {
      throw new Error("Invalid dateFilter");
    }

    return {
      dateFilter: dateFilter as any,
      lineId: filters.lineId,
      pcbId: filters.pcbId,
      operatorId: filters.operatorId,
      shiftId: filters.shiftId,
    };
  }

  /**
   * Build query string helper for API params
   */
  static buildQueryString(params: Record<string, any>): string {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        query.append(key, String(value));
      }
    });
    return query.toString();
  }

  /**
   * Parse query string to filters object
   */
  static parseQueryString(queryString: string): Record<string, string | undefined> {
    const params = new URLSearchParams(queryString);
    const result: Record<string, string | undefined> = {};
    params.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
}
