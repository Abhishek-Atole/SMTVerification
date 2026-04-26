import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/auth-context";

export interface ActiveSession {
  id: string;
  bomId: number;
  bomName: string;
  operatorId: number;
  status: "active" | "completed" | "cancelled";
  startedAt: string;
}

interface SessionContextType {
  activeSession: ActiveSession | null;
  loading: boolean;
  refreshSession: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

function normalizeActiveSession(payload: unknown): ActiveSession | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const session = (payload as { session?: unknown }).session;
  if (!session || typeof session !== "object") {
    return null;
  }

  const source = session as Record<string, unknown>;
  const id = typeof source.id === "string" ? source.id.trim() : "";
  const bomId = Number(source.bomId);
  const operatorId = Number(source.operatorId);
  const bomName = typeof source.bomName === "string" ? source.bomName : "Unknown BOM";
  const startedAt = typeof source.startedAt === "string" ? source.startedAt : "";
  const status = source.status;

  if (!id || !Number.isFinite(bomId) || !Number.isFinite(operatorId)) {
    return null;
  }

  if (status !== "active" && status !== "completed" && status !== "cancelled") {
    return null;
  }

  return {
    id,
    bomId,
    bomName,
    operatorId,
    status,
    startedAt,
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [location] = useLocation();
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [loading, setLoading] = useState(true);

  const loadActiveSession = async () => {
    if (authLoading) {
      return;
    }

    if (!user) {
      setActiveSession(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/verification/sessions/active", {
        credentials: "include",
      });

      if (!response.ok) {
        setActiveSession(null);
        return;
      }

      const data = await response.json();
      const session = normalizeActiveSession(data);
      setActiveSession(session);
    } catch (err) {
      console.error("[SESSION CONTEXT] Load error", err);
      setActiveSession(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadActiveSession();
  }, [user, authLoading, location]);

  const refreshSession = async () => {
    await loadActiveSession();
  };

  return (
    <SessionContext.Provider value={{ activeSession, loading, refreshSession }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within SessionProvider");
  }

  return context;
}