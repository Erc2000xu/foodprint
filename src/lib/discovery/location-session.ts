export type LocationConsent = true | false | null;

const LOCATION_ENTRY_KEY_PREFIX = "foodprint:location-on-entry:";

function storageKey(scope: string) {
  return `${LOCATION_ENTRY_KEY_PREFIX}${scope || "anonymous"}`;
}

/** Only a boolean consent decision is stored; no position is ever persisted. */
export function readLocationConsent(scope: string): LocationConsent {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(storageKey(scope));
    return value === "true" ? true : value === "false" ? false : null;
  } catch {
    return null;
  }
}

export function writeLocationConsent(scope: string, consent: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(scope), String(consent));
  } catch {
    // A blocked storage implementation must not block manual location.
  }
}

export function clearLocationConsent(scope: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(scope));
  } catch {
    // Storage is an enhancement, not a source of truth for access control.
  }
}

export function shouldShowLocationExplanation(input: {
  enabled: boolean;
  consent: LocationConsent;
  hasExplicitIntent: boolean;
  hasReturnState: boolean;
  sessionPromptResolved: boolean;
}) {
  return input.enabled
    && input.consent === null
    && !input.hasExplicitIntent
    && !input.hasReturnState
    && !input.sessionPromptResolved;
}

export function shouldRequestAutoLocation(input: {
  enabled: boolean;
  consent: LocationConsent;
  hasExplicitIntent: boolean;
  hasReturnState: boolean;
  requestAlreadyStarted: boolean;
}) {
  return input.enabled
    && input.consent === true
    && !input.hasExplicitIntent
    && !input.hasReturnState
    && !input.requestAlreadyStarted;
}

