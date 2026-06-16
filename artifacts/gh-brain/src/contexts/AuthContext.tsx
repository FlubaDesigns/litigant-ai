import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth, isConfigured } from "@/lib/firebase";
import { onUserProfileSnapshot, type UserProfile } from "@/services/firestoreService";
import {
  signUpWithEmail,
  signInWithEmail,
  signInWithGoogle,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  deleteAccount,
} from "@/services/authService";

interface AuthContextValue {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  firebaseReady: boolean;
  signUp: (email: string, password: string, displayName: string, role?: string, organization?: string) => Promise<User>;
  signIn: (email: string, password: string) => Promise<User>;
  signInGoogle: () => Promise<User>;
  logOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  removeAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(isConfigured);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!isConfigured) return;

    let profileUnsub: (() => void) | null = null;

    const authUnsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (profileUnsub) {
        profileUnsub();
        profileUnsub = null;
      }

      if (firebaseUser) {
        const token = await firebaseUser.getIdTokenResult();
        setIsAdmin(token.claims["admin"] === true);

        profileUnsub = onUserProfileSnapshot(firebaseUser.uid, (profile) => {
          setUserProfile(profile);
        });
      } else {
        setUserProfile(null);
        setIsAdmin(false);
      }

      setLoading(false);
    });

    return () => {
      authUnsub();
      if (profileUnsub) profileUnsub();
    };
  }, []);

  const value: AuthContextValue = {
    user,
    userProfile,
    loading,
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
