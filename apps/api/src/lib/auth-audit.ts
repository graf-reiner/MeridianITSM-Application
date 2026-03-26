import { prisma } from '@meridian/db';

/**
 * Auth-specific audit event types.
 *
 * These map to the Prisma AuditAction enum values (LOGIN, LOGOUT, CREATE,
 * UPDATE, DELETE) when persisted, with the full event type stored in the
 * `resource` field for granular filtering.
 */
export type AuthEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'LOGOUT'
  | 'MFA_CHALLENGE_SUCCESS'
  | 'MFA_CHALLENGE_FAILURE'
  | 'MFA_DEVICE_ENROLLED'
  | 'MFA_DEVICE_REMOVED'
  | 'SSO_CONNECTION_CREATED'
  | 'SSO_CONNECTION_UPDATED'
  | 'SSO_CONNECTION_DELETED'
  | 'AUTH_POLICY_UPDATED'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_COMPLETED'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_UNLOCKED';

/** Map auth event types to the Prisma AuditAction enum value. */
function toAuditAction(
  eventType: AuthEventType,
): 'LOGIN' | 'LOGOUT' | 'CREATE' | 'UPDATE' | 'DELETE' {
  switch (eventType) {
    case 'LOGIN_SUCCESS':
    case 'LOGIN_FAILURE':
      return 'LOGIN';
    case 'LOGOUT':
      return 'LOGOUT';
    case 'SSO_CONNECTION_CREATED':
    case 'MFA_DEVICE_ENROLLED':
      return 'CREATE';
    case 'SSO_CONNECTION_UPDATED':
    case 'AUTH_POLICY_UPDATED':
    case 'MFA_CHALLENGE_SUCCESS':
    case 'MFA_CHALLENGE_FAILURE':
    case 'PASSWORD_CHANGED':
    case 'PASSWORD_RESET_REQUESTED':
    case 'PASSWORD_RESET_COMPLETED':
    case 'ACCOUNT_LOCKED':
    case 'ACCOUNT_UNLOCKED':
      return 'UPDATE';
    case 'SSO_CONNECTION_DELETED':
    case 'MFA_DEVICE_REMOVED':
      return 'DELETE';
    default:
      return 'UPDATE';
  }
}

interface AuditLogParams {
  tenantId: string;
  userId?: string;
  eventType: AuthEventType;
  resourceId?: string;
  authMethod?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  success: boolean;
}

/**
 * Log an authentication/authorization event to the audit_logs table.
 *
 * This function is intentionally fire-and-forget: audit logging must
 * **never** break the auth flow, so all errors are caught and logged
 * to stderr only.
 */
export async function logAuthEvent(params: AuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId ?? null,
        action: toAuditAction(params.eventType),
        resource: params.eventType,
        resourceId: params.resourceId ?? null,
        newData: {
          authMethod: params.authMethod,
          success: params.success,
          ...params.metadata,
        },
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  } catch (error) {
    // Audit logging should never break the auth flow
    console.error('Auth audit log failed:', error);
  }
}
