import React, { createContext, useContext, useMemo, useState } from "react";

type AuthUser = {
  id: string;
  name: string;
  email: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  hasSeenTutorial: boolean;
  markTutorialSeen: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const mockDelay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hasSeenTutorial, setHasSeenTutorial] = useState(false);

  const signIn = async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      throw new Error("Email and password are required.");
    }
    await mockDelay(350);
    setUser({
      id: "demo-user",
      name: normalizedEmail.split("@")[0] || "Aestha User",
      email: normalizedEmail,
    });
  };

  const signUp = async (name: string, email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!name.trim() || !normalizedEmail || password.length < 6) {
      throw new Error("Name, valid email, and password (6+ chars) are required.");
    }
    await mockDelay(450);
    setUser({
      id: "demo-user",
      name: name.trim(),
      email: normalizedEmail,
    });
  };

  const signOut = () => {
    setUser(null);
  };

  const markTutorialSeen = () => {
    setHasSeenTutorial(true);
  };

  const value = useMemo(
    () => ({
      user,
      hasSeenTutorial,
      markTutorialSeen,
      signIn,
      signUp,
      signOut,
    }),
    [user, hasSeenTutorial]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}
