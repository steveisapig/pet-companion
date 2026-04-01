/**
 * Supabase Auth health check. Useful for diagnosing network connectivity.
 * Equivalent to: curl -i "https://<project>.supabase.co/auth/v1/health"
 */
export async function checkSupabaseAuthHealth(): Promise<{ ok: boolean; status: number; error?: string }> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const healthUrl = `${url.replace(/\/$/, '')}/auth/v1/health`;

  try {
    const res = await fetch(healthUrl, {
      method: 'GET',
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 0, error: msg };
  }
}
