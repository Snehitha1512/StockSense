"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User } from "./types";
import { Permission, hasPermission } from "./rbac";
import { getSessionToken, setSessionToken, clearSessionToken, setupFetchInterceptor } from "./api";
import { useRouter } from "next/navigation";

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  can: (permission: Permission) => boolean;
  login: (token: string, user: User) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refreshUser = useCallback(async (): Promise<User | null> => {
    setupFetchInterceptor();
    const token = getSessionToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return null;
    }

    try {
      const res = await fetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          setLoading(false);
          return data.user;
        }
      }
      clearSessionToken();
      setUser(null);
      setLoading(false);
      return null;
    } catch {
      setUser(null);
      setLoading(false);
      return null;
    }
  }, []);

  useEffect(() => {
    setupFetchInterceptor();
    refreshUser();
  }, [refreshUser]);

  const login = (token: string, userData: User) => {
    // Always clear any stale token first (e.g. from browser Duplicate Tab which copies sessionStorage)
    clearSessionToken();
    setSessionToken(token);
    setUser(userData);
  };

  const logout = async () => {
    const token = getSessionToken();
    try {
      if (token) {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token }),
        });
      }
    } catch (e) {
      console.error("Logout request failed:", e);
    } finally {
      clearSessionToken();
      setUser(null);
      router.push("/login");
      router.refresh();
    }
  };

  const can = (permission: Permission): boolean => {
    if (!user) return false;
    return hasPermission(user.role, permission);
  };

  return (
    <AuthContext.Provider value={{ user, loading, can, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
