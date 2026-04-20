/**
 * Report API Service - Handles all API calls to report endpoints
 */

export interface ReportFilters {
  dateFilter?: "today" | "yesterday" | "last7" | "last30" | "custom";
  startDate?: Date;
  endDate?: Date;
  lineId?: string;
  pcbId?: string;
  operatorId?: string;
  operatorName?: string;
  shiftId?: string;
  lotNumber?: string;
}

interface ReportResponse {
  report: any[];
  metadata: {
    reportType: string;
    generatedAt: string;
    queryTime: number;
    recordCount: number;
  };
}

/**
 * Build query string from filters
 */
function buildQueryString(filters: ReportFilters): string {
  const params = new URLSearchParams();

  if (filters.dateFilter && filters.dateFilter !== "custom") {
    params.append("dateFilter", filters.dateFilter);
  }

  if (filters.dateFilter === "custom") {
    if (filters.startDate) {
      params.append("startDate", filters.startDate.toISOString());
    }
    if (filters.endDate) {
      params.append("endDate", filters.endDate.toISOString());
    }
  }

  if (filters.lineId) params.append("lineId", filters.lineId);
  if (filters.pcbId) params.append("pcbId", filters.pcbId);
  if (filters.operatorId) params.append("operatorId", filters.operatorId);
  if (filters.operatorName) params.append("operatorName", filters.operatorName);
  if (filters.shiftId) params.append("shiftId", filters.shiftId);
  if (filters.lotNumber) params.append("lotNumber", filters.lotNumber);

  return params.toString();
}

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:3000/api";

/**
 * Fetch FPY Report
 */
export async function fetchFPYReport(filters: ReportFilters): Promise<ReportResponse> {
  const queryString = buildQueryString(filters);
  const response = await fetch(`${API_BASE}/reports/fpy?${queryString}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch FPY report: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch OEE Report
 */
export async function fetchOEEReport(filters: ReportFilters): Promise<ReportResponse> {
  const queryString = buildQueryString(filters);
  const response = await fetch(`${API_BASE}/reports/oee?${queryString}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch OEE report: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch Operator Performance Report
 */
export async function fetchOperatorReport(filters: ReportFilters): Promise<ReportResponse> {
  const queryString = buildQueryString(filters);
  const response = await fetch(`${API_BASE}/reports/operator?${queryString}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch operator report: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch Operator Comparison Report
 */
export async function fetchOperatorComparisonReport(filters: ReportFilters): Promise<ReportResponse> {
  const queryString = buildQueryString(filters);
  const response = await fetch(`${API_BASE}/reports/operator-comparison?${queryString}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch operator comparison report: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch Feeder Performance Report
 */
export async function fetchFeederReport(filters: ReportFilters): Promise<ReportResponse> {
  const queryString = buildQueryString(filters);
  const response = await fetch(`${API_BASE}/reports/feeder?${queryString}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch feeder report: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch Feeder Reliability Report
 */
export async function fetchFeederReliabilityReport(filters: ReportFilters): Promise<ReportResponse> {
  const queryString = buildQueryString(filters);
  const response = await fetch(`${API_BASE}/reports/feeder-reliability?${queryString}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch feeder reliability report: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch Alarm Report
 */
export async function fetchAlarmReport(filters: ReportFilters): Promise<ReportResponse> {
  const queryString = buildQueryString(filters);
  const response = await fetch(`${API_BASE}/reports/alarm?${queryString}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch alarm report: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch Error Analysis Report
 */
export async function fetchErrorAnalysisReport(filters: ReportFilters): Promise<ReportResponse> {
  const queryString = buildQueryString(filters);
  const response = await fetch(`${API_BASE}/reports/error-analysis?${queryString}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch error analysis report: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch Component Usage Report
 */
export async function fetchComponentReport(filters: ReportFilters): Promise<ReportResponse> {
  const queryString = buildQueryString(filters);
  const response = await fetch(`${API_BASE}/reports/component?${queryString}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch component report: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch Lot Traceability Report
 */
export async function fetchLotTraceabilityReport(filters: ReportFilters): Promise<ReportResponse> {
  const queryString = buildQueryString(filters);
  const response = await fetch(`${API_BASE}/reports/lot-traceability?${queryString}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch lot traceability report: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch Trend Report
 */
export async function fetchTrendReport(filters: ReportFilters): Promise<ReportResponse> {
  const queryString = buildQueryString(filters);
  const response = await fetch(`${API_BASE}/reports/trend?${queryString}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch trend report: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Export a report to file
 */
export async function exportReport(
  reportType: string,
  format: "pdf" | "xlsx" | "csv",
  filters: ReportFilters
): Promise<{ filename: string; downloadUrl: string; format: string }> {
  const queryString = buildQueryString(filters);
  const response = await fetch(`${API_BASE}/reports/export/${reportType}?format=${format}&${queryString}`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Failed to export report: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Download a file from the server
 */
export async function downloadFile(filePath: string): Promise<Blob> {
  const response = await fetch(filePath);

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }

  return response.blob();
}

/**
 * Get export history for current user
 */
export async function getExportHistory(): Promise<any[]> {
  const response = await fetch(`${API_BASE}/reports/exports/user/history`);

  if (!response.ok) {
    throw new Error(`Failed to fetch export history: ${response.statusText}`);
  }

  const data = await response.json();
  return data.exports || [];
}
