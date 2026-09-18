import { useEffect, useState } from 'react'

/** Object URL for a Blob, created and revoked inside an effect so it survives React StrictMode remounts. */
export function useObjectUrl(blob?: Blob): string {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!blob) { setUrl(''); return }
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}
