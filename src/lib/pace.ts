/**
 * Keeps a repeating analysis from starving the screen. `cost` is how long the last run took; the next run waits about twice that,
 * never less than `min` (fast phones keep their full rate) and never more than `max` (a slow phone still updates a few times a second).
 */
export const nextGap = (cost: number, min: number, max = 260): number => Math.min(max, Math.max(min, cost * 2))

/** A smoothed cost, so one slow frame (garbage collection, a touch) does not throttle the whole session. */
export const smooth = (previous: number | null, sample: number, weight = 0.3): number => (previous == null ? sample : previous * (1 - weight) + sample * weight)
