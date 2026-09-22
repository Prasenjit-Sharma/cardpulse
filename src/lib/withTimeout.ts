/** Resolves with the promise's value if it settles first, otherwise with `fallback` after `ms`. Never rejects. */
export async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), ms) })
  try {
    return await Promise.race([promise.catch(() => fallback), timeout])
  } finally {
    clearTimeout(timer!)
  }
}
