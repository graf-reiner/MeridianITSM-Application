import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface User {
    tenantId?: string;
    roles?: string[];
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string;
      tenantId: string;
      roles: string[];
      authMethod: string;
      mfaVerified: boolean;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    tenantId?: string;
    roles?: string[];
    authMethod?: string;
    mfaVerified?: boolean;
  }
}
