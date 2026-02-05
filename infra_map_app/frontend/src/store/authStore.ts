import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Token } from '../types';

interface AuthState {
  user: User | null;
  token: Token | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  setToken: (token: Token | null) => void;
  login: (user: User, token: Token) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      setUser: (user) => set({ user }),

      setToken: (token) => set({ token, isAuthenticated: !!token }),

      login: (user, token) =>
        set({
          user,
          token,
          isAuthenticated: true,
        }),

      logout: () =>
        set({
          user: null,
          token: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
