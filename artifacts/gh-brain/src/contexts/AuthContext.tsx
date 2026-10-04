import { useContext, useEffect, useState, useRef, useCallback, type ReactNode } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth, isConfigured } from "@/lib/firebase";
import { onUserProfileSnapshot, getUserProfile, type UserProfile } from "@/services/firestoreService";
import {
  ensureAccountSetup,
  signUpWithEmail,
  signInWithEmail,
  signInWithGoogle,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  deleteAccount,
} from "@/services/authService";
import { AuthContext, type AuthContextValue } from "./authContextDef";

export type { AuthContextValue };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(isConfigured);
  const [isAdmin, setIsAdmin] = useState(false);

  const [setupError, setSetupError] = useState<string | null>(null);
  const generation = useRef(0);
  const profileUnsub = useRef<(() => void) | null>(null);

  const initializeAccount = useCallback(async (firebaseUser: User | null) => {
    const version = ++generation.current;
    profileUnsub.current?.();
    profileUnsub.current = null;
    setUser(firebaseUser);
    setUserProfile(null);
    setIsAdmin(false);
    setSetupError(null);
    setLoading(!!firebaseUser);
    if (!firebaseUser) return;
    try {
      await ensureAccountSetup(firebaseUser);
      const [token, profile] = await Promise.all([
        firebaseUser.getIdTokenResult(), getUserProfile(firebaseUser.uid),
      ]);
      if (version !== generation.current) return;
      if (!profile) throw new Error("Your account profile could not be loaded. Retry setup to continue.");
      setIsAdmin(token.claims["admin"] === true);
      setUserProfile(profile);
      profileUnsub.current = onUserProfileSnapshot(firebaseUser.uid, next => {
        if (version !== generation.current) return;
        setUserProfile(next);
        if (!next) setSetupError("Your account profile is unavailable. Retry setup to continue.");
      }, () => {
        if (version === generation.current) setSetupError("Your account profile could not be refreshed. Retry setup to reconnect.");
      });
    } catch (error) {
      if (version !== generation.current) return;
      const message = error instanceof Error ? error.message : "Account setup failed. Please retry.";
      setSetupError(message);
      throw new Error(message);
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }, []);

  const retryAccountSetup = useCallback(async () => {
    await initializeAccount(auth.currentUser);
  }, [initializeAccount]);

  useEffect(() => {
    if (!isConfigured) return;
    const unsubscribe = onAuthStateChanged(auth, firebaseUser => {
      void initializeAccount(firebaseUser).catch(() => {}); // surfaced by setupError
    });
    return () => {
      ++generation.current;
      unsubscribe();
      profileUnsub.current?.();
      profileUnsub.current = null;
    };
  }, [initializeAccount]);

  const value: AuthContextValue = {
    user,
    userProfile,
    loading,
    setupError,
    retryAccountSetup,
    isAdmin,
    firebaseReady: isConfigured,
    signUp: signUpWithEmail,
    signIn: signInWithEmail,
    signInGoogle: signInWithGoogle,
    logOut: signOut,
    resetPassword: sendPasswordResetEmail,
    resendVerification: sendEmailVerification,
    removeAccount: deleteAccount,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
