import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Role = "engineer" | "qa" | "operator";

interface User {
  userId: number;
  name: string;
  role: Role;
}

interface AuthSessionResponse {
  authenticated?: boolean;
  userId: number;
  username: string;
  role: Role;
}

const AUTH_SESSION_HINT_KEY = "feeder-scanner-auth-session";

function hasAuthSessionHint() {
  return typeof window !== "undefined" && window.localStorage.getItem(AUTH_SESSION_HINT_KEY) === "true";
}

function setAuthSessionHint(isAuthenticated: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  if (isAuthenticated) {
    window.localStorage.setItem(AUTH_SESSION_HINT_KEY, "true");
    return;
  }

  window.localStorage.removeItem(AUTH_SESSION_HINT_KEY);
}

function normalizeAuthSession(payload: unknown): AuthSessionResponse | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const source = "user" in payload && typeof (payload as { user?: unknown }).user === "object"
    ? (payload as { user: Record<string, unknown> }).user
    : (payload as Record<string, unknown>);

  if (source.authenticated === false) {
    return null;
  }

  const userId = Number(source.userId ?? source.id);
  const username = typeof source.username === "string" ? source.username : "";
  const role = source.role;

  if (!Number.isFinite(userId) || !username || (role !== "engineer" && role !== "qa" && role !== "operator")) {
    return null;
  }

  return {
    authenticated: true,
    userId,
    username,
    role,
  };
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, role: Role, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function fetchWithCredentials<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw response;
  }

  return readJsonResponse<T>(response);
}

async function toAuthError(response: Response): Promise<Error> {
  try {
    const payload = await readJsonResponse<{ error?: string }>(response);
    if (payload?.error) {
      const normalized = payload.error.trim().toLowerCase();
      if (normalized === "unauthorized" || normalized === "invalid credentials") {
        return new Error("Invalid username, role, or password.");
      }

      return new Error(payload.error);
    }
  } catch {
    // Ignore JSON parsing failures and fallback to status-based error text.
  }

  if (response.status === 401) {
    return new Error("Invalid username, role, or password.");
  }

  return new Error(`Authentication request failed (${response.status}).`);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.pathname.endsWith("/login")) {
      setUser(null);
      setLoading(false);
      return;
    }

    if (!hasAuthSessionHint()) {
      setUser(null);
      setLoading(false);
      return;
    }

    let active = true;

    void (async () => {
      try {
        const sessionPayload = await fetchWithCredentials<unknown>("/api/auth/me");
        const session = normalizeAuthSession(sessionPayload);
        if (active) {
          if (session) {
            setUser({ userId: session.userId, name: session.username, role: session.role });
            setAuthSessionHint(true);
          } else {
            setUser(null);
            setAuthSessionHint(false);
          }
        }
      } catch (error) {
        const isExpectedUnauthenticated =
          error instanceof Response && error.status === 401;

        // 401 errors are expected when user is not logged in - no need to warn
        if (!isExpectedUnauthenticated) {
          console.error("[AuthContext] Failed to restore session", error);
        }

        if (active) {
          setUser(null);
          setAuthSessionHint(false);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const login = async (username: string, role: Role, password: string) => {
    let session: AuthSessionResponse;
    setLoading(true);
    try {
      const sessionPayload = await fetchWithCredentials<unknown>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password, role }),
      });

      const normalized = normalizeAuthSession(sessionPayload);
      if (!normalized) {
        throw new Error("Login succeeded but user session payload is invalid.");
      }
      session = normalized;
    } catch (error) {
      if (error instanceof Response) {
        throw await toAuthError(error);
      }
      throw error;
    } finally {
      setLoading(false);
    }

    setUser({ userId: session.userId, name: session.username, role: session.role });
    setAuthSessionHint(true);
  };

  const logout = async () => {
    setLoading(true);
    await fetchWithCredentials<{ success: boolean }>("/api/auth/logout", {
      method: "POST",
    });
    setUser(null);
    setAuthSessionHint(false);
    setLoading(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
