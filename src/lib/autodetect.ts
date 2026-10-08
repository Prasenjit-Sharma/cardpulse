/**
 * Whether the camera hunts for the card and shoots on its own. Off unless the user switched it on (the stored value is
 * '1'): detection still misses cards on busy backgrounds, so the shutter is the default (user, 2026-10-08).
 */
export const AUTO_KEY = 'cardpulse.autoDetect'
export const autoDetectOn = (stored: string | null): boolean => stored === '1'
