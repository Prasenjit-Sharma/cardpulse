export const supabase = new Proxy({}, { get: (_t, k) => (globalThis as any).__client[k] })
export const cloudEnabled = true
