import { describe, it, expect } from 'vitest';
import { renderTemplate, extractTokens } from '../render.js';
import { getVariablesForContext } from '../registry.js';
import { getFormFieldVariables, buildFormFieldContext } from '../form-fields.js';

describe('renderTemplate', () => {
  it('returns empty string for null/undefined templates', () => {
    expect(renderTemplate(null, {})).toBe('');
    expect(renderTemplate(undefined, {})).toBe('');
    expect(renderTemplate('', {})).toBe('');
  });

  it('substitutes a flat variable', () => {
    expect(renderTemplate('Hello {{name}}', { name: 'Alex' })).toBe('Hello Alex');
  });

  it('substitutes multiple variables in one template', () => {
    const ctx = { a: 'Alex', b: 'Jordan' };
    expect(renderTemplate('{{a}} and {{b}}', ctx)).toBe('Alex and Jordan');
  });

  it('substitutes nested dotted paths', () => {
    const ctx = { ticket: { requester: { firstName: 'Alex' } } };
    expect(renderTemplate('Hi {{ticket.requester.firstName}}!', ctx)).toBe('Hi Alex!');
  });

  it('falls back to empty string for missing variables', () => {
    expect(renderTemplate('Hi {{missing}}', {})).toBe('Hi ');
  });

  it('uses custom fallback when provided', () => {
    expect(
      renderTemplate('Hi {{missing}}', {}, { fallback: '???' }),
    ).toBe('Hi ???');
  });

  it('distinguishes between null and the string "null"', () => {
    expect(renderTemplate('v={{x}}', { x: null })).toBe('v=');
    expect(renderTemplate('v={{x}}', { x: 'null' })).toBe('v=null');
  });

  it('renders numbers and booleans', () => {
    expect(renderTemplate('{{n}} {{b}}', { n: 42, b: true })).toBe('42 true');
  });

  it('renders dates as ISO strings', () => {
    const d = new Date('2026-04-10T14:30:00Z');
    expect(renderTemplate('at {{d}}', { d })).toBe('at 2026-04-10T14:30:00.000Z');
  });

  it('renders arrays as comma-separated strings', () => {
    expect(renderTemplate('{{tags}}', { tags: ['a', 'b', 'c'] })).toBe('a, b, c');
  });

  it('HTML-escapes values when escapeHtml=true', () => {
    const ctx = { body: '<script>alert(1)</script>' };
    const out = renderTemplate('Body: {{body}}', ctx, { escapeHtml: true });
    expect(out).toBe('Body: &lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('does NOT HTML-escape by default', () => {
    const ctx = { body: '<b>hi</b>' };
    expect(renderTemplate('{{body}}', ctx)).toBe('<b>hi</b>');
  });

  it('leaves malformed tokens untouched', () => {
    // Unclosed `{{` — no `}}`
    expect(renderTemplate('text {{foo and more', { foo: 'bar' })).toBe('text {{foo and more');
  });

  it('handles paths that traverse a missing segment gracefully', () => {
    const ctx = { ticket: {} };
    expect(renderTemplate('v={{ticket.requester.firstName}}', ctx)).toBe('v=');
  });

  it('does not traverse through non-object values', () => {
    const ctx = { ticket: 'not an object' };
    expect(renderTemplate('v={{ticket.title}}', ctx)).toBe('v=');
  });

  it('supports repeated tokens for the same variable', () => {
    expect(renderTemplate('{{x}} = {{x}}', { x: 'hi' })).toBe('hi = hi');
  });
});

describe('extractTokens', () => {
  it('returns tokens in left-to-right order', () => {
    expect(extractTokens('{{a}} and {{b.c}} and {{a}}')).toEqual(['a', 'b.c', 'a']);
  });

  it('returns empty array for empty or null input', () => {
    expect(extractTokens('')).toEqual([]);
    expect(extractTokens(null)).toEqual([]);
    expect(extractTokens(undefined)).toEqual([]);
    expect(extractTokens('no tokens here')).toEqual([]);
  });
});

describe('getVariablesForContext', () => {
  it('returns ticket variables for ["ticket"]', () => {
    const vars = getVariablesForContext(['ticket']);
    expect(vars.length).toBeGreaterThan(5);
    expect(vars.some((v) => v.key === 'ticket.number')).toBe(true);
    expect(vars.some((v) => v.key === 'requester.email')).toBe(false);
  });

  it('merges multiple catalogs without duplicates', () => {
    const vars = getVariablesForContext(['ticket', 'requester', 'tenant']);
    const keys = vars.map((v) => v.key);
    const unique = new Set(keys);
    expect(keys.length).toBe(unique.size);
    expect(keys).toContain('ticket.number');
    expect(keys).toContain('requester.email');
    expect(keys).toContain('tenant.name');
  });

  it('returns empty list for unknown context keys (safe fallback)', () => {
    // @ts-expect-error testing invalid input on purpose
    expect(getVariablesForContext(['nonexistent'])).toEqual([]);
  });

  it('returns empty list for formFields catalog (dynamic per-form)', () => {
    expect(getVariablesForContext(['formFields'])).toEqual([]);
  });
});

describe('getFormFieldVariables', () => {
  it('builds field.<key> entries from form fields', () => {
    const fields = [
      { fieldKey: 'first_name', label: 'First Name', fieldType: 'text' },
      { fieldKey: 'issue', label: 'Issue', helpText: 'Describe briefly', fieldType: 'textarea' },
    ];
    const vars = getFormFieldVariables(fields);
    expect(vars).toHaveLength(2);
    expect(vars[0]).toMatchObject({
      key: 'field.first_name',
      label: 'First Name',
      category: 'Form Fields',
    });
    expect(vars[1].description).toBe('Describe briefly');
  });

  it('deduplicates fields with the same key', () => {
    const fields = [
      { fieldKey: 'email', label: 'Email', fieldType: 'email' },
      { fieldKey: 'email', label: 'Email (dup)', fieldType: 'email' },
    ];
    expect(getFormFieldVariables(fields)).toHaveLength(1);
  });

  it('gives sensible example values per field type', () => {
    const fields = [
      { fieldKey: 'age', label: 'Age', fieldType: 'number' },
      { fieldKey: 'ts', label: 'When', fieldType: 'datetime' },
    ];
    const vars = getFormFieldVariables(fields);
    expect(vars[0].example).toBe('42');
    expect(vars[1].example).toBe('2026-04-10T14:30');
  });
});

describe('buildFormFieldContext', () => {
  it('maps instance values into field.<key> paths', () => {
    const fields = [
      { instanceId: 'inst-1', fieldKey: 'first_name', label: 'First', fieldType: 'text' },
      { instanceId: 'inst-2', fieldKey: 'issue', label: 'Issue', fieldType: 'textarea' },
    ];
    const values = {
      'inst-1': { label: 'First', value: 'Alex' },
      'inst-2': { label: 'Issue', value: 'Printer offline' },
    };
    const ctx = buildFormFieldContext(fields, values);
    expect(ctx).toEqual({ first_name: 'Alex', issue: 'Printer offline' });
  });

  it('works with flat (unwrapped) values', () => {
    const fields = [
      { instanceId: 'a', fieldKey: 'name', label: 'Name', fieldType: 'text' },
    ];
    const ctx = buildFormFieldContext(fields, { a: 'Alex' });
    expect(ctx).toEqual({ name: 'Alex' });
  });
});

describe('integration — full form template rendering', () => {
  it('renders a form template end-to-end using the shared engine', () => {
    const fields = [
      { instanceId: 'inst-1', fieldKey: 'first_name', label: 'First', fieldType: 'text' },
      { instanceId: 'inst-2', fieldKey: 'subject', label: 'Subject', fieldType: 'text' },
    ];
    const values = {
      'inst-1': { value: 'Alex' },
      'inst-2': { value: 'Printer offline' },
    };
    const ctx = {
      field: buildFormFieldContext(fields, values),
      form: { name: 'IT Support', slug: 'it-support' },
      submission: { date: '2026-04-10', submitterEmail: 'alex@acme.com' },
    };
    const template =
      '{{field.first_name}} reported: {{field.subject}} (from {{form.name}})';
    expect(renderTemplate(template, ctx)).toBe(
      'Alex reported: Printer offline (from IT Support)',
    );
  });
});
