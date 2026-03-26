import NextAuth from 'next-auth';

// Auth.js configuration — used for SSO flows only
// Local email/password login continues through /auth-action (existing system)
export const { handlers, auth, signIn, signOut } = NextAuth({
  // Use JWT strategy (no database sessions)
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    // Placeholder for dynamic OIDC provider (Phase 3)
    // Placeholder for SAML Jackson provider (Phase 4)
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      // On initial sign-in from SSO, attach custom fields
      if (user) {
        token.userId = user.id;
        token.tenantId = (user as any).tenantId;
        token.roles = (user as any).roles ?? [];
        token.authMethod = account?.provider ?? 'sso';
        token.mfaVerified = false;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        (session.user as any).tenantId = token.tenantId;
        (session.user as any).roles = token.roles;
        (session.user as any).authMethod = token.authMethod;
        (session.user as any).mfaVerified = token.mfaVerified;
      }
      return session;
    },
    async signIn({ user, account, profile }) {
      // JIT provisioning hook — will be implemented in Phase 3
      // For now, allow all sign-ins through
      return true;
    },
  },
  // Use a separate secret for Auth.js (or share with existing JWT_SECRET)
  secret: process.env.NEXTAUTH_SECRET ?? process.env.JWT_SECRET ?? 'meridian-dev-jwt-secret-change-in-production',
});
