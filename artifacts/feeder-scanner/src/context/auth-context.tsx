import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Role = "engineer" | "qa" | "operator";

interface User {
  userId: number;
  name: string;
  role: Role;
}

interface AuthSessionResponse {
  userId: number;
  username: string;
  role: Role;
}

interface AuthContextType {
  user: User | null;
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

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const session = await fetchWithCredentials<AuthSessionResponse>("/api/auth/me");
        if (active) {
          setUser({ userId: session.userId, name: session.username, role: session.role });
        }
      } catch (error) {
        const isExpectedUnauthenticated =
          error instanceof Response && error.status === 401;

        if (!isExpectedUnauthenticated) {
          console.warn("[AuthContext] Failed to restore session", error);
        }

        if (active) {
          setUser(null);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const login = async (username: string, role: Role, password: string) => {
    let session: AuthSessionResponse;
    try {
      session = await fetchWithCredentials<AuthSessionResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password, role }),
      });
    } catch (error) {
      if (error instanceof Response) {
        throw await toAuthError(error);
      }
      throw error;
    }

    setUser({ userId: session.userId, name: session.username, role: session.role });
  };

  const logout = async () => {
    await fetchWithCredentials<{ success: boolean }>("/api/auth/logout", {
      method: "POST",
    });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
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
