"use client";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const storageKey = "erp-edu-session";
const refreshSkewSeconds = 120;

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: string;
  user: { id: string; email?: string };
};

function config() {
  if (!url || !key) throw new Error("Supabase auth configuration is missing.");
  return { url, key };
}

function withExpiry(session: AuthSession): AuthSession {
  if (session.expires_at) return session;
  return { ...session, expires_at: Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600) };
}

export function getStoredSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    return withExpiry(JSON.parse(raw) as AuthSession);
  } catch {
    window.localStorage.removeItem(storageKey);
    return null;
  }
}

export function storeSession(session: AuthSession) {
  const normalized = withExpiry(session);
  window.localStorage.setItem(storageKey, JSON.stringify(normalized));
  window.dispatchEvent(new Event("erp-auth-change"));
}

export function signOut() {
  window.localStorage.removeItem(storageKey);
  window.dispatchEvent(new Event("erp-auth-change"));
}

export async function refreshSession(session?: AuthSession | null) {
  const current = session ?? getStoredSession();
  if (!current?.refresh_token) return null;
  const cfg = config();
  const response = await fetch(`${cfg.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: cfg.key, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: current.refresh_token }),
  });
  const data = await response.json();
  if (!response.ok || !data?.access_token) {
    signOut();
    return null;
  }
  const refreshed = withExpiry(data as AuthSession);
  storeSession(refreshed);
  return refreshed;
}

export async function getValidSession() {
  const session = getStoredSession();
  if (!session) return null;
  const expiresAt = Number(session.expires_at || 0);
  const now = Math.floor(Date.now() / 1000);
  if (!expiresAt || expiresAt - now > refreshSkewSeconds) return session;
  return refreshSession(session);
}

export async function signIn(email: string, password: string) {
  const cfg = config();
  const response = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: cfg.key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description ?? data.msg ?? "Unable to sign in.");
  const session = withExpiry(data as AuthSession);
  storeSession(session);
  return session;
}

export async function signUp(email: string, password: string, fullName: string) {
  const cfg = config();
  const response = await fetch(`${cfg.url}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: cfg.key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, data: { full_name: fullName } }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description ?? data.msg ?? "Unable to create account.");
  if (data.access_token) storeSession(withExpiry(data as AuthSession));
  return data;
}
