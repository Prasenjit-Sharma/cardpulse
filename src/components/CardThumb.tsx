import { useObjectUrl } from '../lib/useObjectUrl'
import Avatar from './Avatar'

/** The card photo when we have one, otherwise the person's initials. */
export default function CardThumb({ blob, name }: { blob?: Blob; name: string }) {
  const url = useObjectUrl(blob)
  return url ? <img className="scan-thumb" src={url} alt="" /> : <Avatar name={name} size={48} />
}
