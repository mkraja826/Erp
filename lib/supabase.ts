const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function safeErrorDetail(raw: string) {
  if (!raw) return "request failed";
  try {
    const parsed = JSON.parse(raw) as { code?: unknown; message?: unknown };
    const code = typeof parsed.code === "string" ? parsed.code.slice(0, 64) : "";
    const message = typeof parsed.message === "string" ? parsed.message.slice(0, 180) : "";
    return [code, message].filter(Boolean).join(" ") || "request failed";
  } catch {
    return raw.replace(/\s+/g, " ").slice(0, 180) || "request failed";
  }
}

export function getSupabaseConfig() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }
  let parsed: URL;
  try {
    parsed = new URL(supabaseUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is invalid");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must use HTTPS");
  }
  return { url: parsed.origin, key: supabasePublishableKey };
}

export async function supabaseRest<T>(
  path: string,
  init: RequestInit = {},
  accessToken?: string
): Promise<T> {
  const { url, key } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken ?? key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const details = safeErrorDetail(await response.text());
    throw new Error(`Supabase request failed (${response.status}): ${details}`);
  }

  if (response.status === 204) return undefined as T;
  const body = await response.text();
  return (body ? JSON.parse(body) : undefined) as T;
}

export async function getSupabaseUser(accessToken: string) {
  const { url, key } = getSupabaseConfig();
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return response.json() as Promise<{ id: string; email?: string }>;
}
