import type { Tenant, User } from '@prisma/client';

declare module 'fastify' {
  interface FastifyRequest {
    tenant: Tenant;
    tenantId: string;
    currentUser: User & { roles: string[]; roleSlugs: string[] };
    apiKey?: { id: string; scopes: string[]; tenantId: string };
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      userId: string;
      tenantId: string;
      email: string;
      roles: string[];
      type: 'access' | 'refresh';
    };
    user: {
      userId: string;
      tenantId: string;
      email: string;
      roles: string[];
      type: 'access' | 'refresh';
    };
  }
}
