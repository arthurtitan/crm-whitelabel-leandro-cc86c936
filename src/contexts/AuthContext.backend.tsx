/**
 * Backend Auth Provider
 * 
 * JWT-based authentication using Express backend.
 * Used when VITE_USE_BACKEND=true (VPS deployment).
 * 
 * IMPORTANT: This exports BackendAuthProvider only.
 * useAuth and useRoleAccess are imported from AuthContext.tsx
 * since both providers share the same React context.
 */

import React, { useState, useCallback, useEffect, ReactNode, useRef } from 'react';
import { apiClient, tokenManager } from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';
import { toast } from 'sonner';

// Import the shared context from the main AuthContext file
// This is a module-level import for the React context object only
import { AuthContext } from '@/contexts/AuthContext';

// --- Normalize helpers for snake_case / camelCase backend responses ---
function normalizeUser(raw: any): User {
  return {
    id: raw.id,
    email: raw.email,
    nome: raw.nome,
    role: raw.role,
    account_id: raw.account_id ?? raw.accountId,
    permissions: raw.permissions || ['dashboard'],
    status: raw.status || 'active',
    chatwoot_agent_id: raw.chatwoot_agent_id ?? raw.chatwootAgentId,
  };
}

function normalizeAccount(raw: any): Account | null {
  if (!raw) return null;
  return {
    id: raw.id,
    nome: raw.nome,
    status: raw.status,
    chatwoot_base_url: raw.chatwoot_base_url ?? raw.chatwootBaseUrl,
    chatwoot_account_id: raw.chatwoot_account_id ?? raw.chatwootAccountId,
    chatwoot_api_key: raw.chatwoot_api_key ?? raw.chatwootApiKey,
  };
}

// Types (same as AuthContext.tsx)
interface User {
  id: string;
  email: string;
  nome: string;
  role: 'super_admin' | 'admin' | 'agent';
  account_id?: string;
  permissions: string[];
  status: 'active' | 'inactive' | 'suspended';
  chatwoot_agent_id?: number;
}

interface Account {
  id: string;
  nome: string;
  status: 'active' | 'paused' | 'cancelled';
  chatwoot_base_url?: string;
  chatwoot_account_id?: string;
  chatwoot_api_key?: string;
}

interface AuthState {
  user: User | null;
  account: Account | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authError: string | null;
}

export function BackendAuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    account: null,
    isAuthenticated: false,
    isLoading: true,
    authError: null,
  });
  const [originalUser, setOriginalUser] = useState<User | null>(null);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const mountedRef = useRef(true);

  const clearAuthError = useCallback(() => {
    setAuthState(prev => ({ ...prev, authError: null }));
  }, []);

  // Hydrate user from /api/auth/me
  const hydrateFromToken = useCallback(async () => {
    const token = tokenManager.getToken();
    console.log('[BackendAuth] Hydrating from token:', token ? 'Found' : 'None');
    
    if (!token) {
      console.log('[BackendAuth] No token found, finalizing loading');
      setAuthState(prev => ({ ...prev, isLoading: false }));
      return;
    }

    try {
      console.log('[BackendAuth] Fetching user info from backend...');
      const raw = await apiClient.get<any>(API_ENDPOINTS.AUTH.ME);
      // Support both { data: { user, account } } and { user, account }
      const response = raw?.data ?? raw;

      if (!mountedRef.current) return;

      console.log('[BackendAuth] Hydration successful for:', response.user?.email);
      setAuthState({
        user: normalizeUser(response.user),
        account: normalizeAccount(response.account),
        isAuthenticated: true,
        isLoading: false,
        authError: null,
      });
    } catch (error: any) {
      console.error('[BackendAuth] Failed to hydrate:', error);
      
      // Only clear tokens if we are sure it's an auth failure (401)
      // Network errors (no status) should NOT clear tokens to allow refresh retry
      if (error?.status === 401) {
        console.log('[BackendAuth] Token invalid/expired, clearing tokens');
        tokenManager.clearTokens();
      }
      
      if (mountedRef.current) {
        setAuthState(prev => ({ 
          ...prev, 
          isLoading: false,
          isAuthenticated: false, // Ensure we are not authenticated if fetch failed
        }));
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    hydrateFromToken();

    const handleUnauthorized = () => {
      if (!mountedRef.current) return;
      tokenManager.clearTokens();
      setAuthState({
        user: null, account: null, isAuthenticated: false, isLoading: false, authError: null,
      });
      setOriginalUser(null);
      setIsImpersonating(false);
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, [hydrateFromToken]);

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setAuthState(prev => ({ ...prev, authError: null, isLoading: true }));

    try {
      const raw = await apiClient.post<any>(
        API_ENDPOINTS.AUTH.LOGIN, { email, password }, { skipAuth: true }
      );
      // Support both { data: { user, token, ... } } and flat response
      const response = raw?.data ?? raw;

      tokenManager.setToken(response.token);
      tokenManager.setRefreshToken(response.refreshToken);

      setAuthState({
        user: normalizeUser(response.user),
        account: normalizeAccount(response.account),
        isAuthenticated: true,
        isLoading: false,
        authError: null,
      });

      return { success: true };
    } catch (error: any) {
      const errorMessage = error?.message || error?.error?.message || 'Erro ao fazer login';
      setAuthState(prev => ({ ...prev, isLoading: false, authError: errorMessage }));
      return { success: false, error: errorMessage };
    }
  }, []);

  const signUp = useCallback(async (_email: string, _password: string, _nome: string): Promise<{ success: boolean; error?: string }> => {
    return { success: false, error: 'Cadastro disponível apenas via administrador' };
  }, []);

  const logout = useCallback(async () => {
    setAuthState(prev => ({ ...prev, isLoading: true }));
    try {
      await apiClient.post(API_ENDPOINTS.AUTH.LOGOUT);
    } catch (error) {
      console.error('[BackendAuth] Logout error:', error);
    } finally {
      tokenManager.clearTokens();
      setAuthState({
        user: null, account: null, isAuthenticated: false, isLoading: false, authError: null,
      });
      setOriginalUser(null);
      setIsImpersonating(false);
    }
  }, []);

  const impersonate = useCallback(async (userId: string) => {
    if (authState.user?.role !== 'super_admin') return;

    try {
      // Save original token before swapping
      const originalToken = tokenManager.getToken();
      if (originalToken) {
        localStorage.setItem('original_token', originalToken);
      }

      const raw = await apiClient.post<any>(
        API_ENDPOINTS.AUTH.IMPERSONATE(userId)
      );
      // Support envelope { data: { user, account } }
      const response = raw?.data ?? raw;

      // Use the new JWT for the target user
      if (response.token) {
        tokenManager.setToken(response.token);
      }

      const targetUser = normalizeUser(response.user);
      const targetAccount = normalizeAccount(response.account);

      setOriginalUser(authState.user);
      setIsImpersonating(true);
      setAuthState(prev => ({ ...prev, user: targetUser, account: targetAccount }));
      toast.success(`Assumindo identidade de ${targetUser.nome}`);
    } catch {
      // Restore original token on failure
      const originalToken = localStorage.getItem('original_token');
      if (originalToken) {
        tokenManager.setToken(originalToken);
        localStorage.removeItem('original_token');
      }
      toast.error('Erro ao assumir identidade');
    }
  }, [authState.user]);

  const exitImpersonation = useCallback(() => {
    if (!originalUser) return;
    // Restore original super admin token
    const originalToken = localStorage.getItem('original_token');
    if (originalToken) {
      tokenManager.setToken(originalToken);
      localStorage.removeItem('original_token');
    }
    setAuthState(prev => ({ ...prev, user: originalUser, account: null }));
    setOriginalUser(null);
    setIsImpersonating(false);
    toast.success('Voltou para sua conta original');
  }, [originalUser]);

  return (
    <AuthContext.Provider
      value={{
        ...authState,
        login,
        logout,
        signUp,
        impersonate,
        exitImpersonation,
        isImpersonating,
        originalUser,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
