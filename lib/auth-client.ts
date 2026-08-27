"use client";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const storageKey = "erp-edu-session";

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: { id: string; email?: string };
};

function config() {
  if (!url || !key) throw new Error("Supabase auth configuration is missing.");
  return { url, key };
}

export function getStoredSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    window.localStorage.removeItem(storageKey);
    return null;
  }
}

export function storeSession(session: AuthSession) {
  window.localStorage.setItem(storageKey, JSON.stringify(session));
  window.dispatchEvent(new Event("erp-auth-change"));
}

export function signOut() {
  window.localStorage.removeItem(storageKey);
  window.dispatchEvent(new Event("erp-auth-change"));
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
  storeSession(data as AuthSession);
  return data as AuthSession;
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
  if (data.access_token) storeSession(data as AuthSession);
  return data;
}
