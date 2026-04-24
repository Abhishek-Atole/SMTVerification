/**
 * Report API Service - Handles all calls to the reporting API
 */
const API_BASE = "/api";
export class ReportApi {
    /**
     * Build query string from filters
     */
    static buildQueryString(filters) {
        const params = new URLSearchParams();
        if (filters.dateFilter) {
            params.append("dateFilter", filters.dateFilter);
        }
        if (filters.startDate) {
            params.append("startDate", filters.startDate.toISOString());
        }
        if (filters.endDate) {
            params.append("endDate", filters.endDate.toISOString());
        }
        if (filters.line) {
            params.append("line", filters.line);
        }
        if (filters.pcb) {
            params.append("pcb", filters.pcb);
        }
        if (filters.operator) {
            params.append("operator", filters.operator);
        }
        if (filters.shift) {
            params.append("shift", filters.shift);
        }
        return params.toString();
    }
    /**
     * Fetch FPY Report
     */
    static async fetchFPYReport(filters) {
        const queryString = this.buildQueryString(filters);
        const response = await fetch(`${API_BASE}/reports/fpy?${queryString}`);
        if (!response.ok) {
            throw new Error("Failed to fetch FPY report");
        }
        return response.json();
    }
    /**
     * Fetch OEE Report
     */
    static async fetchOEEReport(filters) {
        const queryString = this.buildQueryString(filters);
        const response = await fetch(`${API_BASE}/reports/oee?${queryString}`);
        if (!response.ok) {
            throw new Error("Failed to fetch OEE report");
        }
        return response.json();
    }
    /**
     * Fetch Operator Performance Report
     */
    static async fetchOperatorReport(filters) {
        const queryString = this.buildQueryString(filters);
        const response = await fetch(`${API_BASE}/reports/operator?${queryString}`);
        if (!response.ok) {
            throw new Error("Failed to fetch operator report");
        }
        return response.json();
    }
    /**
     * Fetch Operator Comparison Report
     */
    static async fetchOperatorComparisonReport(filters) {
        const queryString = this.buildQueryString(filters);
        const response = await fetch(`${API_BASE}/reports/operator-comparison?${queryString}`);
        if (!response.ok) {
            throw new Error("Failed to fetch operator comparison report");
        }
        return response.json();
    }
    /**
     * Fetch Feeder Performance Report
     */
    static async fetchFeederReport(filters) {
        const queryString = this.buildQueryString(filters);
        const response = await fetch(`${API_BASE}/reports/feeder?${queryString}`);
        if (!response.ok) {
            throw new Error("Failed to fetch feeder report");
        }
        return response.json();
    }
    /**
     * Fetch Feeder Reliability Report
     */
    static async fetchFeederReliabilityReport(filters) {
        const queryString = this.buildQueryString(filters);
        const response = await fetch(`${API_BASE}/reports/feeder-reliability?${queryString}`);
        if (!response.ok) {
            throw new Error("Failed to fetch feeder reliability report");
        }
        return response.json();
    }
    /**
     * Fetch Alarm Report
     */
    static async fetchAlarmReport(filters) {
        const queryString = this.buildQueryString(filters);
        const response = await fetch(`${API_BASE}/reports/alarm?${queryString}`);
        if (!response.ok) {
            throw new Error("Failed to fetch alarm report");
        }
        return response.json();
    }
    /**
     * Fetch Error Analysis Report
     */
    static async fetchErrorAnalysisReport(filters) {
        const queryString = this.buildQueryString(filters);
        const response = await fetch(`${API_BASE}/reports/error-analysis?${queryString}`);
        if (!response.ok) {
            throw new Error("Failed to fetch error analysis report");
        }
        return response.json();
    }
    /**
     * Fetch Component Usage Report
     */
    static async fetchComponentReport(filters) {
        const queryString = this.buildQueryString(filters);
        const response = await fetch(`${API_BASE}/reports/component?${queryString}`);
        if (!response.ok) {
            throw new Error("Failed to fetch component report");
        }
        return response.json();
    }
    /**
     * Fetch Lot Traceability Report
     */
    static async fetchLotTraceabilityReport(filters) {
        const queryString = this.buildQueryString(filters);
        const response = await fetch(`${API_BASE}/reports/lot-traceability?${queryString}`);
        if (!response.ok) {
            throw new Error("Failed to fetch lot traceability report");
        }
        return response.json();
    }
    /**
     * Fetch Trend Report
     */
    static async fetchTrendReport(filters) {
        const queryString = this.buildQueryString(filters);
        const response = await fetch(`${API_BASE}/reports/trend?${queryString}`);
        if (!response.ok) {
            throw new Error("Failed to fetch trend report");
        }
        return response.json();
    }
    /**
     * Export report to PDF/Excel/CSV
     */
    static async exportReport(reportType, format, filters) {
        const response = await fetch(`${API_BASE}/reports/export/${reportType}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ format, filters }),
        });
        if (!response.ok) {
            throw new Error("Failed to export report");
        }
        return response.json();
    }
    /**
     * Get export history
     */
    static async getExportHistory() {
        const response = await fetch(`${API_BASE}/reports/exports/history`);
        if (!response.ok) {
            throw new Error("Failed to fetch export history");
        }
        return response.json();
    }
}
