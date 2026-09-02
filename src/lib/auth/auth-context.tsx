"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { Creator } from "@/types/creator";
import { AuthError } from "@/lib/auth/types";
import { getAuthProvider } from "@/lib/auth/provider";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  creator: Creator | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [creator, setCreator] = useState<Creator | null>(null);

  useEffect(() => {
    // Session lives in a cookie, unreadable during SSR, so it can only be
    // hydrated client-side after mount — not derivable during render.
    const session = getAuthProvider().getSession();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCreator(session);
    setStatus(session ? "authenticated" : "unauthenticated");
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const signedIn = await getAuthProvider().signInWithPassword(email, password);
      setCreator(signedIn);
      setStatus("authenticated");
      router.push("/dashboard");
      router.refresh();
    },
    [router]
  );

  const signOut = useCallback(async () => {
    await getAuthProvider().signOut();
    setCreator(null);
    setStatus("unauthenticated");
    router.push("/login");
    router.refresh();
  }, [router]);

  return (
    <AuthContext.Provider value={{ status, creator, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { AuthError };
