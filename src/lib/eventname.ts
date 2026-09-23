/**
 * How an event's name is shown anywhere in the app: in capitals, like the name on an exhibition badge. Display only —
 * the name is stored as typed, so exports, search and the lead page keep the user's own spelling.
 */
export const showEvent = (name: string): string => name.toLocaleUpperCase('en-IN')
