'use client';

// ─── Restore Instructions Modal ───────────────────────────────────────────────
// Fetches GET /api/backups/<runId>/restore-instructions and renders the markdown.
// react-markdown is NOT a dependency of apps/owner — uses a hand-rolled renderer
// that handles the RESTORE.md format: H1/H2, paragraphs, fenced code blocks
// with a "Copy" button.

import { useState, useEffect } from 'react';
import { ownerFetch } from '../../../lib/api';

interface Props {
  runId: string;
  onClose: () => void;
}

interface ParsedBlock {
  type: 'h1' | 'h2' | 'h3' | 'p' | 'code';
  content: string;
  lang?: string;
}

// ─── Minimal markdown parser ──────────────────────────────────────────────────
// Handles the RESTORE.md format produced by buildRestoreMd():
//   # H1, ## H2, ### H3, paragraphs, fenced code blocks (``` ... ```)
// Inline backtick code is handled in the paragraph renderer.
function parseMarkdown(md: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const lines = md.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith('```')) {
        codeLines.push(lines[i]!);
        i++;
      }
      i++; // consume closing ```
      blocks.push({ type: 'code', content: codeLines.join('\n'), lang });
      continue;
    }

    // Headings
    if (line.startsWith('### ')) {
      blocks.push({ type: 'h3', content: line.slice(4) });
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', content: line.slice(3) });
      i++;
      continue;
    }
    if (line.startsWith('# ')) {
      blocks.push({ type: 'h1', content: line.slice(2) });
      i++;
      continue;
    }

    // Empty line — skip
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph — accumulate until blank line or heading/code start
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() !== '' &&
      !lines[i]!.startsWith('#') &&
      !lines[i]!.startsWith('```')
    ) {
      paraLines.push(lines[i]!);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'p', content: paraLines.join(' ') });
    }
  }

  return blocks;
}

// ─── Render inline code (`...`) within a paragraph text ──────────────────────
function ParagraphText({ text }: { text: string }) {
  // Split on backtick-delimited spans
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((part, idx) => {
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code
              key={idx}
              style={{ fontFamily: 'monospace', fontSize: '12px', background: '#f1f5f9', padding: '1px 5px', borderRadius: 3, color: '#0f172a' }}
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={idx}>{part}</span>;
      })}
    </>
  );
}

// ─── Single code block with Copy button ──────────────────────────────────────
function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div style={{ position: 'relative', marginBottom: 16 }}>
      {lang && (
        <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
          {lang}
        </div>
      )}
      <div style={{ position: 'relative', background: '#0f172a', borderRadius: 6, overflow: 'hidden' }}>
        <pre style={{ margin: 0, padding: '14px 16px', overflowX: 'auto', fontSize: '12px', lineHeight: 1.6, color: '#e2e8f0', fontFamily: 'monospace' }}>
          <code>{code}</code>
        </pre>
        <button
          onClick={handleCopy}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            padding: '4px 10px',
            fontSize: '11px',
            fontWeight: 500,
            background: copied ? '#166534' : 'rgba(255,255,255,0.1)',
            color: copied ? '#dcfce7' : '#94a3b8',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 4,
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────
export default function RestoreInstructionsModal({ runId, onClose }: Props) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    ownerFetch(`/api/backups/${runId}/restore-instructions`)
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { markdown: string };
        if (!cancelled) setMarkdown(data.markdown);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load restore instructions');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [runId]);

  const blocks = markdown ? parseMarkdown(markdown) : [];

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 760, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#0f172a' }}>Restore Instructions</h2>
            <p style={{ fontSize: 12, color: '#64748b', margin: '3px 0 0' }}>Run ID: <code style={{ fontFamily: 'monospace', fontSize: 11 }}>{runId}</code></p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', fontSize: 22, color: '#64748b', cursor: 'pointer', padding: 4, lineHeight: 1 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '32px', color: '#6b7280', fontSize: 14 }}>Loading restore instructions…</div>
          )}

          {error && (
            <div style={{ padding: '12px 16px', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', fontSize: 14 }}>
              {error}
            </div>
          )}

          {!loading && !error && blocks.map((block, idx) => {
            if (block.type === 'h1') {
              return <h1 key={idx} style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '0 0 12px', paddingBottom: 8, borderBottom: '2px solid #e2e8f0' }}>{block.content}</h1>;
            }
            if (block.type === 'h2') {
              return <h2 key={idx} style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', margin: '20px 0 8px' }}>{block.content}</h2>;
            }
            if (block.type === 'h3') {
              return <h3 key={idx} style={{ fontSize: 14, fontWeight: 600, color: '#334155', margin: '16px 0 6px' }}>{block.content}</h3>;
            }
            if (block.type === 'code') {
              return <CodeBlock key={idx} code={block.content} lang={block.lang} />;
            }
            // paragraph
            return (
              <p key={idx} style={{ fontSize: 14, color: '#475569', lineHeight: 1.65, margin: '0 0 12px' }}>
                <ParagraphText text={block.content} />
              </p>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 20px', fontSize: 14, fontWeight: 500, backgroundColor: '#4338ca', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
