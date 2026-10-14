"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { login, register, request } from "@/lib/api";
import type { User } from "@/lib/types";

type AuthContextValue = {
  user: User | null;
  token: string | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, role: User["role"]) => Promise<void>;
  signOut: () => void;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const storageKey = "jobconnect.accessToken";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const signOut = useCallback(() => {
    window.sessionStorage.removeItem(storageKey);
    setToken(null);
    setUser(null);
  }, []);

  const acceptToken = useCallback(async (accessToken: string) => {
    const profile = await request<User>("/auth/me", { token: accessToken });
    window.sessionStorage.setItem(storageKey, accessToken);
    setToken(accessToken);
    setUser(profile);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!token) return;
    try {
      const profile = await request<User>("/auth/me", { token });
      setUser(profile);
    } catch {
      // Ignored
    }
  }, [token]);

  useEffect(() => {
    const stored = window.sessionStorage.getItem(storageKey);
    if (!stored) {
      void Promise.resolve().then(() => setReady(true));
      return;
    }
    void request<User>("/auth/me", { token: stored })
      .then((profile) => {
        setToken(stored);
        setUser(profile);
      })
      .catch(() => {
        window.sessionStorage.removeItem(storageKey);
      })
      .finally(() => setReady(true));
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const response = await login(email, password);
      await acceptToken(response.access_token);
    },
    [acceptToken],
  );

  const signUp = useCallback(
    async (email: string, password: string, role: User["role"]) => {
      await register(email, password, role);
      await signIn(email, password);
    },
    [signIn],
  );

  const value = useMemo(
    () => ({ user, token, ready, signIn, signUp, signOut, refreshProfile }),
    [user, token, ready, signIn, signUp, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
