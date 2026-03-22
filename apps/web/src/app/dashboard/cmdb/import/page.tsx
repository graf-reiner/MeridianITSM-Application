'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiCloudUpload, mdiTableColumn, mdiCheckCircle, mdiAlertCircle, mdiDownload, mdiRefresh, mdiEye } from '@mdi/js';
import Papa from 'papaparse';

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardStep = 'UPLOAD' | 'MAP' | 'PREVIEW' | 'IMPORTING' | 'COMPLETE';

interface ImportResult {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; errors: string[] }>;
}

interface RowValidation {
  rowIndex: number;
  mappedRow: Record<string, string>;
  errors: string[];
  isValid: boolean;
}

// CI fields available for mapping
const CI_FIELDS = [
  { value: 'skip', label: '-- Skip --' },
  { value: 'name', label: 'Name (required)', required: true },
  { value: 'type', label: 'Type' },
  { value: 'status', label: 'Status' },
  { value: 'environment', label: 'Environment' },
  { value: 'categorySlug', label: 'Category Slug' },
  { value: 'description', label: 'Description' },
  { value: 'attributesJson.ipAddress', label: 'Attributes: IP Address' },
  { value: 'attributesJson.hostname', label: 'Attributes: Hostname' },
  { value: 'attributesJson.os', label: 'Attributes: OS' },
  { value: 'attributesJson.version', label: 'Attributes: Version' },
  { value: 'attributesJson.manufacturer', label: 'Attributes: Manufacturer' },
  { value: 'attributesJson.model', label: 'Attributes: Model' },
  { value: 'attributesJson.location', label: 'Attributes: Location' },
];

const VALID_TYPES = ['SERVER', 'WORKSTATION', 'NETWORK_DEVICE', 'SOFTWARE', 'SERVICE', 'DATABASE', 'VIRTUAL_MACHINE', 'CONTAINER', 'OTHER'];
const VALID_STATUSES = ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED', 'UNKNOWN'];
const VALID_ENVIRONMENTS = ['PRODUCTION', 'STAGING', 'DEVELOPMENT', 'TEST', 'DR'];

// Auto-map common column names (per RESEARCH.md Pattern 6)
function autoMapColumn(header: string): string {
  const h = header.toLowerCase().replace(/[\s_-]/g, '');
  if (['name', 'ciname', 'ci_name', 'hostname', 'itemname'].includes(h)) return 'name';
  if (['type', 'citype', 'ci_type', 'itemtype'].includes(h)) return 'type';
  if (['status', 'cistatus', 'state'].includes(h)) return 'status';
  if (['environment', 'env', 'cienvironment'].includes(h)) return 'environment';
  if (['category', 'categoryslug', 'cat'].includes(h)) return 'categorySlug';
  if (['description', 'desc', 'details'].includes(h)) return 'description';
  if (['ip', 'ipaddress', 'ip_address'].includes(h)) return 'attributesJson.ipAddress';
  if (['os', 'operatingsystem', 'operating_system'].includes(h)) return 'attributesJson.os';
  if (['manufacturer', 'make', 'vendor'].includes(h)) return 'attributesJson.manufacturer';
  if (['model', 'productmodel'].includes(h)) return 'attributesJson.model';
  return 'skip';
}

function validateRow(mappedRow: Record<string, string>, rowIndex: number): RowValidation {
  const errors: string[] = [];

  if (!mappedRow.name || !mappedRow.name.trim()) {
    errors.push('Name is required');
  }
  if (mappedRow.type && !VALID_TYPES.includes(mappedRow.type.toUpperCase())) {
    errors.push(`Invalid type "${mappedRow.type}". Must be one of: ${VALID_TYPES.join(', ')}`);
  }
  if (mappedRow.status && !VALID_STATUSES.includes(mappedRow.status.toUpperCase())) {
    errors.push(`Invalid status "${mappedRow.status}". Must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  if (mappedRow.environment && !VALID_ENVIRONMENTS.includes(mappedRow.environment.toUpperCase())) {
    errors.push(`Invalid environment "${mappedRow.environment}". Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`);
  }

  return { rowIndex, mappedRow, errors, isValid: errors.length === 0 };
}

function applyColumnMap(rawRow: Record<string, string>, columnMap: Record<string, string>): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [header, field] of Object.entries(columnMap)) {
    if (field === 'skip') continue;
    const value = rawRow[header] ?? '';
    if (field.startsWith('attributesJson.')) {
      const subKey = field.replace('attributesJson.', '');
      if (!mapped.attributesJson) mapped.attributesJson = '{}';
      try {
        const attrs = JSON.parse(mapped.attributesJson) as Record<string, string>;
        attrs[subKey] = value;
        mapped.attributesJson = JSON.stringify(attrs);
      } catch {
        mapped.attributesJson = JSON.stringify({ [subKey]: value });
      }
    } else {
      mapped[field] = value;
    }
  }
  return mapped;
}

// ─── Step Components ──────────────────────────────────────────────────────────

function StepIndicator({ currentStep }: { currentStep: WizardStep }) {
  const steps = [
    { key: 'UPLOAD', label: '1. Upload' },
    { key: 'MAP', label: '2. Map Columns' },
    { key: 'PREVIEW', label: '3. Preview' },
    { key: 'IMPORTING', label: '4. Importing' },
    { key: 'COMPLETE', label: '5. Complete' },
  ];
  const stepOrder = steps.map((s) => s.key);
  const currentIdx = stepOrder.indexOf(currentStep);

  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28, gap: 0 }}>
      {steps.map((step, idx) => {
        const isDone = idx < currentIdx;
        const isActive = step.key === currentStep;
        return (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center', flex: idx < steps.length - 1 ? 1 : 'none' }}>
            <div style={{
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              backgroundColor: isDone ? '#d1fae5' : isActive ? '#4f46e5' : '#f3f4f6',
              color: isDone ? '#065f46' : isActive ? '#fff' : '#9ca3af',
              whiteSpace: 'nowrap',
            }}>
              {step.label}
            </div>
            {idx < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, backgroundColor: isDone ? '#10b981' : '#e5e7eb', margin: '0 4px' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CmdbImportPage() {
  const [step, setStep] = useState<WizardStep>('UPLOAD');

  // Step 1 state
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [fullData, setFullData] = useState<Record<string, string>[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2 state
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});

  // Step 3 state
  const [validations, setValidations] = useState<RowValidation[]>([]);

  // Step 4/5 state
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const processFile = useCallback((file: File) => {
    setParseError(null);
    setFileName(file.name);

    if (file.name.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const parsed = JSON.parse(content) as unknown;
          const rows = Array.isArray(parsed) ? parsed as Record<string, string>[] : (parsed as { data?: Record<string, string>[] }).data ?? [];
          if (rows.length === 0) { setParseError('No records found in JSON file'); return; }
          const headers = Object.keys(rows[0]);
          setParsedHeaders(headers);
          setPreviewRows(rows.slice(0, 15).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '')])));
          setFullData(rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '')]))));
          const autoMap: Record<string, string> = {};
          headers.forEach((h) => { autoMap[h] = autoMapColumn(h); });
          setColumnMap(autoMap);
          setStep('MAP');
        } catch {
          setParseError('Invalid JSON file. Please check the file format.');
        }
      };
      reader.readAsText(file);
    } else {
      // CSV: use papaparse with worker: false (RESEARCH.md pitfall 3 — Next.js Worker scope issue)
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        worker: false,
        complete: (results) => {
          if (results.errors.length > 0 && results.data.length === 0) {
            setParseError(`CSV parse error: ${results.errors[0].message}`);
            return;
          }
          const rows = results.data;
          if (rows.length === 0) { setParseError('No records found in CSV file'); return; }
          const headers = results.meta.fields ?? Object.keys(rows[0]);
          setParsedHeaders(headers);
          setPreviewRows(rows.slice(0, 15));
          setFullData(rows);
          const autoMap: Record<string, string> = {};
          headers.forEach((h) => { autoMap[h] = autoMapColumn(h); });
          setColumnMap(autoMap);
          setStep('MAP');
        },
        error: (err: { message?: string }) => {
          setParseError(`Failed to parse CSV: ${err.message ?? 'unknown error'}`);
        },
      });
    }
  }, []);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleNextToPreview = useCallback(() => {
    // Validate that 'name' is mapped
    const hasMappedName = Object.values(columnMap).includes('name');
    if (!hasMappedName) {
      alert('You must map at least one column to "Name (required)"');
      return;
    }
    // Run validations on first 10 rows for preview
    const previewValidations = previewRows.slice(0, 10).map((row, idx) => {
      const mappedRow = applyColumnMap(row, columnMap);
      return validateRow(mappedRow, idx + 1);
    });
    setValidations(previewValidations);
    setStep('PREVIEW');
  }, [columnMap, previewRows]);

  const handleImport = useCallback(async () => {
    setStep('IMPORTING');
    setImportError(null);
    try {
      // Map all full data rows
      const mappedRows = fullData.map((row) => applyColumnMap(row, columnMap));
      // Filter out clearly invalid rows (missing name) — server handles remaining validation
      const validRows = mappedRows.filter((r) => r.name && r.name.trim());

      const res = await fetch('/api/v1/cmdb/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rows: validRows, columnMap }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Import failed');
      }

      const result = (await res.json()) as ImportResult;
      setImportResult(result);
      setStep('COMPLETE');
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
      setStep('PREVIEW');
    }
  }, [fullData, columnMap]);

  const handleDownloadErrors = useCallback(() => {
    if (!importResult) return;
    const blob = new Blob([JSON.stringify(importResult.errors, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import-errors.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [importResult]);

  const handleReset = useCallback(() => {
    setStep('UPLOAD');
    setFileName(null);
    setParsedHeaders([]);
    setPreviewRows([]);
    setFullData([]);
    setParseError(null);
    setColumnMap({});
    setValidations([]);
    setImportResult(null);
    setImportError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const validPreviewCount = validations.filter((v) => v.isValid).length;
  const invalidPreviewCount = validations.filter((v) => !v.isValid).length;
  const validTotalCount = fullData.filter((row) => {
    const mappedRow = applyColumnMap(row, columnMap);
    return mappedRow.name && mappedRow.name.trim();
  }).length;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <Link href="/dashboard/cmdb" style={{ color: '#6b7280', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiCloudUpload} size={1} color="#4f46e5" />
          Bulk Import CIs
        </h1>
      </div>

      {/* Step Indicator */}
      <StepIndicator currentStep={step} />

      {/* Card */}
      <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 28 }}>

        {/* STEP 1: UPLOAD */}
        {step === 'UPLOAD' && (
          <div>
            <h2 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: '#111827' }}>Upload File</h2>
            <p style={{ margin: '0 0 20px', color: '#6b7280', fontSize: 14 }}>
              Upload a CSV or JSON file containing your CI data. CSV files must have a header row.
            </p>

            {/* Drag and drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${isDragOver ? '#4f46e5' : '#d1d5db'}`,
                borderRadius: 10,
                padding: '48px 24px',
                textAlign: 'center',
                cursor: 'pointer',
                backgroundColor: isDragOver ? '#eef2ff' : '#f9fafb',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon path={mdiCloudUpload} size={2.5} color={isDragOver ? '#4f46e5' : '#9ca3af'} />
              <p style={{ margin: '12px 0 4px', fontSize: 16, fontWeight: 600, color: isDragOver ? '#4f46e5' : '#374151' }}>
                {isDragOver ? 'Drop file here' : 'Drag & drop your file here'}
              </p>
              <p style={{ margin: 0, fontSize: 13, color: '#9ca3af' }}>or click to browse — CSV or JSON files supported</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.json"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
            </div>

            {parseError && (
              <div style={{ marginTop: 14, padding: '10px 14px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, color: '#dc2626', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon path={mdiAlertCircle} size={0.8} color="currentColor" />
                {parseError}
              </div>
            )}

            <p style={{ marginTop: 20, fontSize: 12, color: '#9ca3af' }}>
              <strong>Tips:</strong> CSV columns can use any names — you will map them to CI fields in the next step.
              JSON files should be an array of objects. Maximum recommended file size: 10,000 rows.
            </p>
          </div>
        )}

        {/* STEP 2: MAP */}
        {step === 'MAP' && (
          <div>
            <h2 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon path={mdiTableColumn} size={1} color="#4f46e5" />
              Map Columns
            </h2>
            <p style={{ margin: '0 0 6px', color: '#6b7280', fontSize: 14 }}>
              File: <strong>{fileName}</strong> — {fullData.length} rows detected, {parsedHeaders.length} columns
            </p>
            <p style={{ margin: '0 0 20px', color: '#6b7280', fontSize: 13 }}>
              Map each file column to a CI field. Columns set to "Skip" will be ignored. <strong>Name</strong> is required.
            </p>

            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb', padding: '8px 14px' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>File Column</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Map to CI Field</span>
              </div>
              {parsedHeaders.map((header, idx) => (
                <div key={header} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, padding: '8px 14px', borderBottom: idx < parsedHeaders.length - 1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#374151', backgroundColor: '#f3f4f6', padding: '2px 8px', borderRadius: 4 }}>{header}</span>
                    {previewRows[0]?.[header] && (
                      <span style={{ marginLeft: 8, fontSize: 12, color: '#9ca3af' }}>e.g. &quot;{previewRows[0][header]}&quot;</span>
                    )}
                  </div>
                  <select
                    value={columnMap[header] ?? 'skip'}
                    onChange={(e) => setColumnMap((prev) => ({ ...prev, [header]: e.target.value }))}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', backgroundColor: columnMap[header] !== 'skip' ? '#f0fdf4' : '#fff' }}
                  >
                    {CI_FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {!Object.values(columnMap).includes('name') && (
              <div style={{ padding: '8px 12px', backgroundColor: '#fef3c7', border: '1px solid #fde68a', borderRadius: 7, marginBottom: 14, color: '#92400e', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon path={mdiAlertCircle} size={0.8} color="currentColor" />
                You must map at least one column to &quot;Name (required)&quot; before continuing.
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={handleReset}
                style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, cursor: 'pointer', backgroundColor: '#fff', color: '#374151' }}
              >
                Back
              </button>
              <button
                onClick={handleNextToPreview}
                disabled={!Object.values(columnMap).includes('name')}
                style={{ padding: '8px 18px', backgroundColor: Object.values(columnMap).includes('name') ? '#4f46e5' : '#a5b4fc', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: Object.values(columnMap).includes('name') ? 'pointer' : 'not-allowed' }}
              >
                Preview &amp; Validate
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: PREVIEW */}
        {step === 'PREVIEW' && (
          <div>
            <h2 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon path={mdiEye} size={1} color="#4f46e5" />
              Preview &amp; Validate
            </h2>
            <p style={{ margin: '0 0 4px', color: '#6b7280', fontSize: 14 }}>
              Showing first {validations.length} rows from <strong>{fullData.length}</strong> total.
            </p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, backgroundColor: '#d1fae5', color: '#065f46' }}>
                {validPreviewCount} valid in preview
              </span>
              {invalidPreviewCount > 0 && (
                <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, backgroundColor: '#fee2e2', color: '#991b1b' }}>
                  {invalidPreviewCount} with errors in preview
                </span>
              )}
              <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, backgroundColor: '#dbeafe', color: '#1e40af' }}>
                {validTotalCount} valid rows total (will be imported)
              </span>
            </div>

            {importError && (
              <div style={{ padding: '10px 14px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, color: '#dc2626', fontSize: 13, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon path={mdiAlertCircle} size={0.8} color="currentColor" />
                {importError}
              </div>
            )}

            {/* Preview table */}
            <div style={{ overflowX: 'auto', marginBottom: 20 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#374151', whiteSpace: 'nowrap' }}>#</th>
                    {Object.entries(columnMap).filter(([, v]) => v !== 'skip').map(([header]) => (
                      <th key={header} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{header}</th>
                    ))}
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {validations.map((validation) => (
                    <tr key={validation.rowIndex} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: validation.isValid ? '#fff' : '#fef2f2' }}>
                      <td style={{ padding: '7px 10px', color: '#6b7280' }}>{validation.rowIndex}</td>
                      {Object.entries(columnMap).filter(([, v]) => v !== 'skip').map(([header, field]) => {
                        const sourceRow = previewRows[validation.rowIndex - 1] ?? {};
                        const cellValue = sourceRow[header] ?? '';
                        const mappedField = field.startsWith('attributesJson.') ? field.replace('attributesJson.', '') : field;
                        const hasError = validation.errors.some((e) => e.toLowerCase().includes(mappedField.toLowerCase()));
                        return (
                          <td key={header} style={{ padding: '7px 10px', color: hasError ? '#dc2626' : '#374151', backgroundColor: hasError ? '#fee2e2' : 'transparent' }}>
                            {cellValue || <span style={{ color: '#d1d5db', fontStyle: 'italic' }}>empty</span>}
                          </td>
                        );
                      })}
                      <td style={{ padding: '7px 10px' }}>
                        {validation.isValid ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#059669', fontSize: 11, fontWeight: 600 }}>
                            <Icon path={mdiCheckCircle} size={0.65} color="currentColor" />
                            Valid
                          </span>
                        ) : (
                          <div>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#dc2626', fontSize: 11, fontWeight: 600, marginBottom: 3 }}>
                              <Icon path={mdiAlertCircle} size={0.65} color="currentColor" />
                              {validation.errors.length} error{validation.errors.length > 1 ? 's' : ''}
                            </span>
                            {validation.errors.map((err, i) => (
                              <div key={i} style={{ fontSize: 11, color: '#dc2626' }}>• {err}</div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={() => setStep('MAP')}
                style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, cursor: 'pointer', backgroundColor: '#fff', color: '#374151' }}
              >
                Back to Mapping
              </button>
              <button
                onClick={() => void handleImport()}
                disabled={validTotalCount === 0}
                style={{
                  padding: '8px 20px',
                  backgroundColor: validTotalCount > 0 ? '#4f46e5' : '#a5b4fc',
                  color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600,
                  cursor: validTotalCount > 0 ? 'pointer' : 'not-allowed',
                }}
              >
                Import {validTotalCount} Valid Row{validTotalCount !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: IMPORTING */}
        {step === 'IMPORTING' && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>
              <div style={{
                display: 'inline-block',
                width: 48,
                height: 48,
                border: '4px solid #e5e7eb',
                borderTopColor: '#4f46e5',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#111827' }}>Importing CIs...</h3>
            <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>Please wait while your data is being imported.</p>
          </div>
        )}

        {/* STEP 5: COMPLETE */}
        {step === 'COMPLETE' && importResult && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <Icon path={mdiCheckCircle} size={3} color="#059669" />
              <h2 style={{ margin: '12px 0 6px', fontSize: 20, fontWeight: 700, color: '#111827' }}>Import Complete</h2>
              <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>Your CI data has been processed.</p>
            </div>

            {/* Result summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
              <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#059669' }}>{importResult.imported}</div>
                <div style={{ fontSize: 13, color: '#065f46', fontWeight: 600 }}>Imported</div>
              </div>
              <div style={{ backgroundColor: '#fefce8', border: '1px solid #fde047', borderRadius: 10, padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#ca8a04' }}>{importResult.skipped}</div>
                <div style={{ fontSize: 13, color: '#854d0e', fontWeight: 600 }}>Skipped</div>
              </div>
              <div style={{ backgroundColor: importResult.errors.length > 0 ? '#fef2f2' : '#f9fafb', border: `1px solid ${importResult.errors.length > 0 ? '#fecaca' : '#e5e7eb'}`, borderRadius: 10, padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: importResult.errors.length > 0 ? '#dc2626' : '#6b7280' }}>{importResult.errors.length}</div>
                <div style={{ fontSize: 13, color: importResult.errors.length > 0 ? '#991b1b' : '#6b7280', fontWeight: 600 }}>Errors</div>
              </div>
            </div>

            {/* Error download */}
            {importResult.errors.length > 0 && (
              <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 14, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                <Icon path={mdiAlertCircle} size={1} color="#dc2626" />
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: '#991b1b' }}>
                    {importResult.errors.length} row{importResult.errors.length > 1 ? 's' : ''} had errors and were skipped.
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: '#b91c1c' }}>Download the error report to review and fix issues, then re-import.</p>
                </div>
                <button
                  onClick={handleDownloadErrors}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  <Icon path={mdiDownload} size={0.75} color="currentColor" />
                  Download Errors
                </button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                onClick={handleReset}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, cursor: 'pointer', backgroundColor: '#fff', color: '#374151' }}
              >
                <Icon path={mdiRefresh} size={0.8} color="currentColor" />
                Import More
              </button>
              <Link
                href="/dashboard/cmdb"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
              >
                View CIs
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
