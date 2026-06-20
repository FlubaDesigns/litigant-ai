import { createContext } from "react";
import type { User } from "firebase/auth";
import type { UserProfile } from "@/services/firestoreService";

export interface AuthContextValue {
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

export const AuthContext = createContext<AuthContextValue | null>(null);
