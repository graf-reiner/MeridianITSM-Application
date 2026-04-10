/**
 * Custom Form Template Variable Migration
 *
 * One-time data migration that rewrites legacy `{{<field-instance-uuid>}}`
 * references inside `CustomForm.titleTemplate` and
 * `CustomForm.descriptionTemplate` to stable `{{field.<key>}}` references
 * using the current `FieldDefinition.key`.
 *
 * Why: before the unified template engine, form templates referenced
 * field instances by their volatile UUID. Renaming a field in the form
 * builder silently broke templates. After this migration, templates
 * reference each field by its stable tenant-unique `FieldDefinition.key`
 * and the new `renderFormTemplate()` service resolves them via the
 * shared `@meridian/core` template engine.
 *
 * Safe to run multiple times — templates that already use `{{field.*}}`
 * syntax are left alone. Unknown UUIDs (fields that no longer exist on
 * the form) are also left untouched so admins can see and fix them.
 *
 * Run:  pnpm --filter @meridian/db tsx scripts/migrate-form-templates.ts
 * Dry-run:  DRY_RUN=1 pnpm --filter @meridian/db tsx scripts/migrate-form-templates.ts
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://meridian:meridian@localhost:5432/meridian';
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

interface LayoutField {
  id?: string;
  instanceId?: string;
  fieldDefinitionId: string;
}

interface LayoutSection {
  fields?: LayoutField[];
}

interface LayoutJson {
  sections?: LayoutSection[];
}

/**
 * Builds a map from field instance UUID → stable FieldDefinition.key
 * for a single form.
 */
async function buildUuidKeyMap(form: {
  id: string;
  tenantId: string;
  layoutJson: unknown;
}): Promise<Map<string, string>> {
  const layout = (form.layoutJson ?? {}) as LayoutJson;
  const sections = layout.sections ?? [];

  // Collect (instanceId, fieldDefinitionId) pairs from the layout
  const pairs: Array<{ instanceId: string; fieldDefinitionId: string }> = [];
  for (const section of sections) {
    for (const field of section.fields ?? []) {
      const instanceId = field.instanceId ?? field.id;
      if (instanceId && field.fieldDefinitionId) {
        pairs.push({ instanceId, fieldDefinitionId: field.fieldDefinitionId });
      }
    }
  }

  if (pairs.length === 0) return new Map();

  // Load all FieldDefinitions referenced by this form
  const defIds = Array.from(new Set(pairs.map((p) => p.fieldDefinitionId)));
  const defs = await prisma.fieldDefinition.findMany({
    where: { id: { in: defIds }, tenantId: form.tenantId },
    select: { id: true, key: true },
  });
  const defKeyById = new Map(defs.map((d) => [d.id, d.key]));

  const result = new Map<string, string>();
  for (const pair of pairs) {
    const key = defKeyById.get(pair.fieldDefinitionId);
    if (key) result.set(pair.instanceId, key);
  }
  return result;
}

/**
 * Rewrites `{{<uuid>}}` tokens in a template to `{{field.<key>}}` using
 * the given map. UUIDs that aren't in the map (e.g. removed fields) are
 * left as-is so the admin can see what's broken.
 */
function rewriteTemplate(
  template: string,
  uuidToKey: Map<string, string>,
): { next: string; rewrites: number; unknownUuids: string[] } {
  let rewrites = 0;
  const unknownUuids: string[] = [];
  const next = template.replace(/\{\{([0-9a-f-]{36})\}\}/gi, (match, uuid: string) => {
    const key = uuidToKey.get(uuid);
    if (!key) {
      unknownUuids.push(uuid);
      return match;
    }
    rewrites++;
    return `{{field.${key}}}`;
  });
  return { next, rewrites, unknownUuids };
}

async function main(): Promise<void> {
  console.log(
    `[migrate-form-templates] Starting${DRY_RUN ? ' (DRY RUN — no writes)' : ''}`,
  );

  const forms = await prisma.customForm.findMany({
    where: {
      OR: [
        { titleTemplate: { not: null } },
        { descriptionTemplate: { not: null } },
      ],
    },
    select: {
      id: true,
      tenantId: true,
      name: true,
      slug: true,
      layoutJson: true,
      titleTemplate: true,
      descriptionTemplate: true,
    },
  });

  console.log(
    `[migrate-form-templates] Found ${forms.length} form(s) with non-empty templates`,
  );

  let totalFormsUpdated = 0;
  let totalRewrites = 0;
  const allUnknownUuids = new Map<string, string[]>(); // formId → list

  for (const form of forms) {
    const uuidToKey = await buildUuidKeyMap(form);

    let newTitle = form.titleTemplate;
    let newDesc = form.descriptionTemplate;
    let formRewrites = 0;
    const unknowns: string[] = [];

    if (form.titleTemplate) {
      const res = rewriteTemplate(form.titleTemplate, uuidToKey);
      newTitle = res.next;
      formRewrites += res.rewrites;
      unknowns.push(...res.unknownUuids);
    }
    if (form.descriptionTemplate) {
      const res = rewriteTemplate(form.descriptionTemplate, uuidToKey);
      newDesc = res.next;
      formRewrites += res.rewrites;
      unknowns.push(...res.unknownUuids);
    }

    if (formRewrites === 0 && unknowns.length === 0) {
      continue; // nothing to do
    }

    if (unknowns.length > 0) {
      allUnknownUuids.set(form.id, unknowns);
    }

    if (formRewrites > 0) {
      totalRewrites += formRewrites;
      totalFormsUpdated++;
      console.log(
        `  [${form.slug}] "${form.name}" → ${formRewrites} rewrite(s)` +
          (unknowns.length > 0 ? `, ${unknowns.length} unknown uuid(s)` : ''),
      );
      if (!DRY_RUN) {
        await prisma.customForm.update({
          where: { id: form.id },
          data: { titleTemplate: newTitle, descriptionTemplate: newDesc },
        });
      }
    } else {
      // Only unknowns, no rewrites — report but don't update
      console.log(
        `  [${form.slug}] "${form.name}" → 0 rewrites, ${unknowns.length} unknown uuid(s) (no-op)`,
      );
    }
  }

  console.log('');
  console.log(
    `[migrate-form-templates] Done. ${totalFormsUpdated} form(s) updated, ${totalRewrites} token(s) rewritten.`,
  );
  if (allUnknownUuids.size > 0) {
    console.log(
      `[migrate-form-templates] ${allUnknownUuids.size} form(s) contain unknown UUID references (likely deleted fields). These are left as-is for manual review:`,
    );
    for (const [formId, uuids] of allUnknownUuids) {
      console.log(`  - ${formId}: ${uuids.slice(0, 5).join(', ')}${uuids.length > 5 ? ` (+${uuids.length - 5} more)` : ''}`);
    }
  }
  if (DRY_RUN) {
    console.log('[migrate-form-templates] DRY_RUN=1 — no database writes were performed.');
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[migrate-form-templates] Failed:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
