const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://parcelwalah.in';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('pw_admin_token');
}

export function setToken(token: string): void {
  localStorage.setItem('pw_admin_token', token);
}

export function clearAuth(): void {
  localStorage.removeItem('pw_admin_token');
  localStorage.removeItem('pw_admin_user');
}

export interface AdminUser {
  id: string;
  phoneNumber: string;
  name?: string;
  role: string;
}

export function getStoredUser(): AdminUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('pw_admin_user');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function setStoredUser(user: AdminUser): void {
  localStorage.setItem('pw_admin_user', JSON.stringify(user));
}

export async function apiRequest<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const isNgrok = API_URL.includes('ngrok');
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(isNgrok ? { 'ngrok-skip-browser-warning': 'true' } : {}),
      ...(options.headers as Record<string, string> | undefined ?? {}),
    },
  });

  let json: any;
  try { json = await res.json(); } catch { json = {}; }

  if (!res.ok) {
    const msg = json?.error?.message || json?.message || `Request failed (${res.status})`;
    if (res.status === 401) clearAuth();
    throw new Error(msg);
  }

  return (json.data ?? json) as T;
}
