/**
 * Custom API client for endpoints not covered by generated API client
 */

class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public response?: any
  ) {
    super(message);
    this.name = "APIError";
  }
}

export const api = {
  async get<T>(url: string, config?: { params?: Record<string, any> }): Promise<{ data: T }> {
    const params = new URLSearchParams();
    if (config?.params) {
      Object.entries(config.params).forEach(([key, value]) => {
        // Only append truthy values (exclude undefined, null, empty strings)
        if (value !== undefined && value !== null && value !== "") {
          params.append(key, String(value));
        }
      });
    }
    const queryString = params.toString();
    const fullUrl = queryString ? `${url}?${queryString}` : url;

    console.debug(`[API] GET ${fullUrl}`);
    try {
      const response = await fetch(fullUrl);
      console.debug(`[API] GET ${fullUrl} - Status: ${response.status}`);
      const data = await response.json();
      console.debug(`[API] GET ${fullUrl} - Response data keys:`, Object.keys(data || {}));
      
      if (!response.ok) {
        console.error(
          `[API] GET ${fullUrl} failed - Status: ${response.status}`,
          data
        );
        throw new APIError(
          data?.error || `API error: ${response.statusText}`,
          response.status,
          { data }
        );
      }
      return { data };
    } catch (error) {
      console.error(`[API] GET ${fullUrl} error:`, error);
      if (error instanceof APIError) {
        throw error;
      }
      throw new Error(
        `Failed to fetch from ${url}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },

  async post<T>(url: string, body?: any): Promise<{ data: T }> {
    console.debug(`[API] POST ${url}`, body);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      console.debug(`[API] POST ${url} - Status: ${response.status}`);
      const data = await response.json();
      console.debug(`[API] POST ${url} - Response data keys:`, Object.keys(data || {}));
      
      if (!response.ok) {
        console.error(`[API] POST ${url} failed - Status: ${response.status}`, data);
        throw new APIError(
          data?.error || `API error: ${response.statusText}`,
          response.status,
          { data }
        );
      }
      return { data };
    } catch (error) {
      console.error(`[API] POST ${url} error:`, error);
      if (error instanceof APIError) {
        throw error;
      }
      throw new Error(
        `Failed to post to ${url}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },

  async delete<T>(url: string): Promise<{ data: T }> {
    console.debug(`[API] DELETE ${url}`);
    try {
      const response = await fetch(url, {
        method: "DELETE",
      });
      console.debug(`[API] DELETE ${url} - Status: ${response.status}`);
      const data = await response.json();
      console.debug(`[API] DELETE ${url} - Response data keys:`, Object.keys(data || {}));
      
      if (!response.ok) {
        console.error(`[API] DELETE ${url} failed - Status: ${response.status}`, data);
        throw new APIError(
          data?.error || `API error: ${response.statusText}`,
          response.status,
          { data }
        );
      }
      return { data };
    } catch (error) {
      console.error(`[API] DELETE ${url} error:`, error);
      if (error instanceof APIError) {
        throw error;
      }
      throw new Error(
        `Failed to delete ${url}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
};
