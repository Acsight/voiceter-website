'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

/**
 * Simplified Auth Context (Supabase removed)
 * 
 * This is a stub implementation since authentication is not required
 * for the demo experience. The waitlist uses DynamoDB via the backend API.
 */

interface UserProfile {
  id: string;
  name?: string;
  email?: string;
  [key: string]: any;
}

interface AuthContextType {
  user: null;
  userProfile: UserProfile | null;
  loading: boolean;
  profileLoading: boolean;
  signIn: (email: string, password: string) => Promise<any>;
  signOut: () => Promise<any>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<any>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [loading] = useState(false);
  const [profileLoading] = useState(false);

  // Stub implementations - auth not used in demo
  const signIn = async (_email: string, _password: string) => {
    return { error: { message: 'Authentication not available in demo mode' } };
  };

  const signOut = async () => {
    return { error: null };
  };

  const updateProfile = async (_updates: Partial<UserProfile>) => {
    return { error: { message: 'Profile updates not available in demo mode' } };
  };

  const value: AuthContextType = {
    user: null,
    userProfile: null,
    loading,
    profileLoading,
    signIn,
    signOut,
    updateProfile,
    isAuthenticated: false,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
