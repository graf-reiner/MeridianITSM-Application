'use client';

import { useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import ImageExtension from '@tiptap/extension-image';
import LinkExtension from '@tiptap/extension-link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RichTextFieldProps {
  /** Current HTML content */
  value: string;
  /** Called with sanitized HTML on every change */
  onChange: (html: string) => void;
  /** Placeholder text when empty */
  placeholder?: string;
  /** Minimum height in pixels (default: 120) */
  minHeight?: number;
  /** Show toolbar (default: true) */
  showToolbar?: boolean;
  /** Compact mode — smaller toolbar, less padding (default: false) */
  compact?: boolean;
  /** Disable editing */
  disabled?: boolean;
}

// ─── Toolbar Button ──────────────────────────────────────────────────────────

function ToolbarBtn({
  onClick,
  isActive,
  children,
  title,
}: {
  onClick: () => void;
  isActive?: boolean;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2px 6px',
        border: '1px solid',
        borderColor: isActive ? 'var(--accent-primary-hover)' : 'var(--border-primary)',
        borderRadius: 4,
        backgroundColor: isActive ? 'var(--badge-indigo-bg)' : 'var(--bg-primary)',
        color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: isActive ? 700 : 400,
        minWidth: 24,
        height: 24,
        transition: 'all 0.1s ease',
      }}
    >
      {children}
    </button>
  );
}

// ─── RichTextField ───────────────────────────────────────────────────────────

/**
 * Reusable TipTap-based rich text editor for form fields.
 *
 * Features: Bold, Italic, Bullet list, Ordered list, Link, Image paste.
 * Outputs HTML string. Use for any multi-line text field in the app.
 *
 * Usage:
 *   <RichTextField value={html} onChange={setHtml} placeholder="Add a comment..." />
 *   <RichTextField value={html} onChange={setHtml} compact minHeight={80} />
 */
export default function RichTextField({
  value,
  onChange,
  placeholder = '',
  minHeight = 120,
  showToolbar = true,
  compact = false,
  disabled = false,
}: RichTextFieldProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      ImageExtension.configure({
        allowBase64: true,
        inline: true,
      }),
      LinkExtension.configure({
        openOnClick: false,
        autolink: true,
      }),
    ],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      // TipTap outputs <p></p> when empty — normalize to empty string
      const normalized = html === '<p></p>' ? '' : html;
      onChange(normalized);
    },
    editorProps: {
      attributes: {
        class: 'rich-text-field-editor',
        style: `min-height: ${minHeight}px; padding: ${compact ? '8px 10px' : '12px 14px'}; font-size: 14px; line-height: 1.6; color: var(--text-secondary); outline: none; cursor: text; background: ${disabled ? 'var(--bg-tertiary)' : 'var(--bg-primary)'};`,
      },
      // Handle image paste from clipboard
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;

        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (!file) continue;

            const reader = new FileReader();
            reader.onload = (e) => {
              const src = e.target?.result as string;
              if (src && editor) {
                editor.chain().focus().setImage({ src }).run();
              }
            };
            reader.readAsDataURL(file);
            return true;
          }
        }
        return false;
      },
      // Handle image drop
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;

        for (const file of Array.from(files)) {
          if (file.type.startsWith('image/')) {
            event.preventDefault();
            const reader = new FileReader();
            reader.onload = (e) => {
              const src = e.target?.result as string;
              if (src && editor) {
                editor.chain().focus().setImage({ src }).run();
              }
            };
            reader.readAsDataURL(file);
            return true;
          }
        }
        return false;
      },
    },
  });

  // Sync external value changes (e.g., form reset)
  useEffect(() => {
    if (editor && value !== undefined) {
      const currentHtml = editor.getHTML();
      const normalizedCurrent = currentHtml === '<p></p>' ? '' : currentHtml;
      if (normalizedCurrent !== value) {
        editor.commands.setContent(value || '');
      }
    }
  }, [editor, value]);

  const addLink = useCallback(() => {
    if (!editor) return;
    const url = window.prompt('Enter URL:');
    if (!url) return;
    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent(`<a href="${url}">${url}</a>`).run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  }, [editor]);

  if (!editor) return null;

  return (
    <div style={{
      border: '1px solid var(--border-secondary)',
      borderRadius: 8,
      overflow: 'hidden',
      opacity: disabled ? 0.6 : 1,
    }}>
      {showToolbar && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 3,
          padding: compact ? '4px 6px' : '6px 8px',
          borderBottom: '1px solid var(--border-primary)',
          backgroundColor: 'var(--bg-secondary)',
        }}>
          <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} title="Bold">
            <strong>B</strong>
          </ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} title="Italic">
            <em>I</em>
          </ToolbarBtn>
          <div style={{ width: 1, backgroundColor: 'var(--border-primary)', margin: '0 1px' }} />
          <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} title="Bullet list">
            &bull;
          </ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} title="Ordered list">
            1.
          </ToolbarBtn>
          <div style={{ width: 1, backgroundColor: 'var(--border-primary)', margin: '0 1px' }} />
          <ToolbarBtn onClick={addLink} isActive={editor.isActive('link')} title="Insert link">
            Link
          </ToolbarBtn>
          {!compact && (
            <>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive('heading', { level: 2 })} title="Heading">
                H2
              </ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} isActive={editor.isActive('blockquote')} title="Quote">
                &ldquo;
              </ToolbarBtn>
            </>
          )}
        </div>
      )}

      <div style={{ position: 'relative' }}>
        <EditorContent editor={editor} />
        {!value && placeholder && (
          <div
            style={{
              position: 'absolute',
              top: compact ? 8 : 12,
              left: compact ? 10 : 14,
              color: 'var(--text-placeholder)',
              fontSize: 14,
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            {editor.isEmpty ? placeholder : ''}
          </div>
        )}
      </div>

      <style>{`
        .rich-text-field-editor:focus { outline: none; }
        .rich-text-field-editor p { margin: 0 0 0.5em; }
        .rich-text-field-editor p:last-child { margin-bottom: 0; }
        .rich-text-field-editor ul, .rich-text-field-editor ol { padding-left: 1.4em; margin: 0 0 0.5em; }
        .rich-text-field-editor li { margin: 0.15em 0; }
        .rich-text-field-editor blockquote { border-left: 3px solid var(--border-secondary); margin: 0.5em 0; padding-left: 0.8em; color: var(--text-muted); }
        .rich-text-field-editor a { color: var(--accent-primary); text-decoration: underline; }
        .rich-text-field-editor img { max-width: 100%; border-radius: 4px; margin: 4px 0; }
        .rich-text-field-editor h2 { font-size: 1.25em; font-weight: 700; margin: 0.5em 0 0.3em; }
        .rich-text-field-editor h3 { font-size: 1.1em; font-weight: 600; margin: 0.5em 0 0.3em; }
      `}</style>
    </div>
  );
}
