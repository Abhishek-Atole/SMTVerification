import { useState, useCallback } from "react";

export interface User {
  id: string;
  email: string;
  name: string;
  role?: string;
}

export interface UseAuthReturn {
  isLoggedIn: boolean;
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

/**
 * useAuth hook for handling authentication state
 * Currently provides mock/local storage-based authentication
 * Can be integrated with real auth service when needed
 */
export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(() => {
    // Try to restore user from localStorage
    try {
      const stored = localStorage.getItem("auth_user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState(false);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      // Mock login - in production, this would call an auth API
      await new Promise((resolve) => setTimeout(resolve, 500));

      const mockUser: User = {
        id: "user-" + Math.random().toString(36).substr(2, 9),
        email,
        name: email.split("@")[0],
        role: "qa",
      };

      setUser(mockUser);
      localStorage.setItem("auth_user", JSON.stringify(mockUser));
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem("auth_user");
  }, []);

  return {
    isLoggedIn: !!user,
    user,
    loading,
    login,
    logout,
  };
}
