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
  login: (name: string, role: Role, password: string) => Promise<void>;
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
      } catch {
        if (active) {
          setUser(null);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const login = async (name: string, role: Role, password: string) => {
    const session = await fetchWithCredentials<AuthSessionResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: name, password, role }),
    });

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
