export type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string;
};

export type AuthSession = {
  user: AuthenticatedUser;
  expiresAt: Date;
};

/**
 * Provider boundary for Supabase Auth today and a future domestic auth system.
 * Implementations must keep invitation validation on the server.
 */
export interface AuthProvider {
  getSession(): Promise<AuthSession | null>;
  signIn(input: { email: string; password: string }): Promise<AuthSession>;
  acceptInvitation(input: { token: string; email: string; password?: string; displayName?: string }): Promise<AuthSession>;
  requestPasswordReset(email: string): Promise<void>;
  signOut(): Promise<void>;
}
