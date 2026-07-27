import { describe, expect, it } from "vitest";
import { decryptInvitationToken, encryptInvitationToken } from "@/lib/invitations/token-crypto";

describe("invitation token encryption", () => {
  const secret = "a-test-only-secret-that-is-longer-than-thirty-two-characters";

  it("round-trips a token without retaining it in plaintext", () => {
    const token = "a7d213b1e1bb0cba11af4d99b4011f6e";
    const ciphertext = encryptInvitationToken(token, secret);
    expect(ciphertext).not.toContain(token);
    expect(decryptInvitationToken(ciphertext, secret)).toBe(token);
  });

  it("rejects a ciphertext encrypted with a different key", () => {
    const ciphertext = encryptInvitationToken("token", secret);
    expect(() => decryptInvitationToken(ciphertext, `${secret}-other`)).toThrow();
  });
});
