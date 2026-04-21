import { sql } from "drizzle-orm";

export interface ReportFilters {
  startDate?: Date | string;
  endDate?: Date | string;
  lineId?: string;
  pcbId?: string;
  operatorId?: string;
  shiftId?: string;
  dateFilter?: "today" | "yesterday" | "last7" | "last30" | "custom";
}

/**
 * FilterService - Builds SQL WHERE clauses and validates filters
 */
export class FilterService {
  /**
   * Convert date filter string to start/end dates
   */
  static buildDateQuery(
    filterType: "today" | "yesterday" | "last7" | "last30" | "custom",
    customDates?: { startDate: string | Date; endDate: string | Date }
  ): { startDate: Date; endDate: Date } {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    switch (filterType) {
      case "today":
        return {
          startDate: today,
          endDate: tomorrow,
        };
      case "yesterday":
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return {
          startDate: yesterday,
          endDate: today,
        };
      case "last7":
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return {
          startDate: sevenDaysAgo,
          endDate: tomorrow,
        };
      case "last30":
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return {
          startDate: thirtyDaysAgo,
          endDate: tomorrow,
        };
      case "custom":
        if (!customDates) {
          throw new Error("Custom date filter requires startDate and endDate");
        }
        return {
          startDate: new Date(customDates.startDate),
          endDate: new Date(customDates.endDate),
        };
      default:
        throw new Error(`Unknown date filter: ${filterType}`);
    }
  }

  /**
   * Build multi-filter WHERE clause
   */
  static buildMultiFilterClause(filters: ReportFilters): string {
    const clauses: string[] = [];

    if (filters.lineId) {
      clauses.push(`s.supervisor_name = '${this.escapeSql(filters.lineId)}'`);
    }
    if (filters.pcbId) {
      clauses.push(`s.panel_name = '${this.escapeSql(filters.pcbId)}'`);
    }
    if (filters.operatorId) {
      clauses.push(`s.operator_name = '${this.escapeSql(filters.operatorId)}'`);
    }
    if (filters.shiftId) {
      clauses.push(`s.shift_name = '${this.escapeSql(filters.shiftId)}'`);
    }

    return clauses.length > 0 ? "AND " + clauses.join(" AND ") : "";
  }

  /**
   * Escape SQL strings to prevent injection
   */
  static escapeSql(value: string): string {
    return value.replace(/'/g, "''");
  }

  /**
   * Validate filter object
   */
  static validateFilters(filters: ReportFilters): void {
    if (filters.startDate && filters.endDate) {
      const start = new Date(filters.startDate);
      const end = new Date(filters.endDate);
      if (start > end) {
        throw new Error("startDate cannot be after endDate");
      }
    }

    // Check that at least one date parameter is provided
    if (!filters.startDate || !filters.endDate) {
      if (!filters.dateFilter) {
        throw new Error("Either provide startDate/endDate or dateFilter");
      }
    }
  }
}
