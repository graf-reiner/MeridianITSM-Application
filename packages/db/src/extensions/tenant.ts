import { Prisma } from '@prisma/client';

const GLOBAL_MODELS = new Set([
  'Tenant',
  'OwnerUser',
  'OwnerSession',
  'SubscriptionPlan',
  'TenantSubscription',
  'TenantUsageSnapshot',
  'OwnerNote',
]);

export function withTenantScope(tenantId: string) {
  return Prisma.defineExtension((client) =>
    client.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }: {
            model: string | undefined;
            operation: string;
            args: Record<string, any>;
            query: (args: Record<string, any>) => Promise<any>;
          }) {
            if (GLOBAL_MODELS.has(model!)) {
              return query(args);
            }

            if (['create', 'createMany', 'createManyAndReturn'].includes(operation)) {
              if (operation === 'createMany') {
                const data = Array.isArray(args.data) ? args.data : [args.data];
                args = { ...args, data: data.map((d: any) => ({ ...d, tenantId })) };
              } else {
                args = { ...args, data: { ...args.data, tenantId } };
              }
            }

            if (
              [
                'findFirst',
                'findMany',
                'findUnique',
                'findFirstOrThrow',
                'findUniqueOrThrow',
                'count',
                'aggregate',
                'groupBy',
              ].includes(operation)
            ) {
              args = { ...args, where: { ...args.where, tenantId } };
            }

            if (['update', 'updateMany', 'delete', 'deleteMany', 'upsert'].includes(operation)) {
              if (operation === 'upsert') {
                args = {
                  ...args,
                  where: { ...args.where, tenantId },
                  create: { ...args.create, tenantId },
                };
              } else {
                args = { ...args, where: { ...args.where, tenantId } };
              }
            }

            return query(args);
          },
        },
      },
    })
  );
}
