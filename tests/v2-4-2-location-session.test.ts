import { describe, expect, it } from "vitest";
import { shouldRequestAutoLocation, shouldShowLocationExplanation } from "@/lib/discovery/location-session";

describe("V2.4.2 location consent and one-shot entry behavior", () => {
  it("explains before the first request and only auto-locates after explicit consent", () => {
    expect(shouldShowLocationExplanation({ enabled: true, consent: null, hasExplicitIntent: false, hasReturnState: false, sessionPromptResolved: false })).toBe(true);
    expect(shouldShowLocationExplanation({ enabled: true, consent: false, hasExplicitIntent: false, hasReturnState: false, sessionPromptResolved: false })).toBe(false);
    expect(shouldRequestAutoLocation({ enabled: true, consent: true, hasExplicitIntent: false, hasReturnState: false, requestAlreadyStarted: false })).toBe(true);
    expect(shouldRequestAutoLocation({ enabled: true, consent: true, hasExplicitIntent: false, hasReturnState: false, requestAlreadyStarted: true })).toBe(false);
  });

  it("does not prompt or auto-locate when a user intent or return state exists", () => {
    expect(shouldShowLocationExplanation({ enabled: true, consent: null, hasExplicitIntent: true, hasReturnState: false, sessionPromptResolved: false })).toBe(false);
    expect(shouldRequestAutoLocation({ enabled: true, consent: true, hasExplicitIntent: false, hasReturnState: true, requestAlreadyStarted: false })).toBe(false);
    expect(shouldRequestAutoLocation({ enabled: false, consent: true, hasExplicitIntent: false, hasReturnState: false, requestAlreadyStarted: false })).toBe(false);
  });
});
