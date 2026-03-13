import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { AUTH_REDIRECT_URL } from "@/src/config";
import { supabase } from "@/src/supabase";

type AuthUser = {
  id: string;
  name: string;
  email: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthReady: boolean;
  hasSeenTutorial: boolean;
  markTutorialSeen: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const toAuthUser = (user: User | null): AuthUser | null => {
  if (!user?.email) return null;
  const fullName = (user.user_metadata?.full_name as string | undefined) || "";
  return {
    id: user.id,
    name: fullName || user.email.split("@")[0] || "Aestha User",
    email: user.email,
  };
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [hasSeenTutorial, setHasSeenTutorial] = useState(false);

  useEffect(() => {
    let mounted = true;

    const applySession = (session: Session | null) => {
      if (!mounted) return;
      setUser(toAuthUser(session?.user ?? null));
      setAccessToken(session?.access_token ?? null);
      setIsAuthReady(true);
    };

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          setIsAuthReady(true);
          return;
        }
        applySession(data.session);
      })
      .catch(() => {
        setIsAuthReady(true);
      });

    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    return () => {
      mounted = false;
      authSub.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw new Error(error.message);
  };

  const signUp = async (name: string, email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!name.trim() || !normalizedEmail || password.length < 6) {
      throw new Error("Name, valid email, and password (6+ chars) are required.");
    }
    const { error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          full_name: name.trim(),
        },
      },
    });
    if (error) throw new Error(error.message);
  };

  const sendPasswordReset = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: AUTH_REDIRECT_URL,
    });
    if (error) throw new Error(error.message);
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(error.message);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const markTutorialSeen = () => {
    setHasSeenTutorial(true);
  };

  const value = useMemo(
    () => ({
      user,
      accessToken,
      isAuthReady,
      hasSeenTutorial,
      markTutorialSeen,
      signIn,
      signUp,
      sendPasswordReset,
      updatePassword,
      signOut,
    }),
    [user, accessToken, isAuthReady, hasSeenTutorial]
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
