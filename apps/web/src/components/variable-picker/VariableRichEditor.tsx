'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import LinkExtension from '@tiptap/extension-link';
import Icon from '@mdi/react';
import { mdiCodeBraces } from '@mdi/js';
import {
  getVariablesForContext,
  type VariableContextKey,
  type VariableDefinition,
} from '@meridian/core/template';
import { VariablePopup } from './VariablePopup';

export interface VariableRichEditorProps {
  value: string;
  onChange: (html: string) => void;
  context: VariableContextKey[];
  dynamicVariables?: VariableDefinition[];
  placeholder?: string;
  minHeight?: number;
  disabled?: boolean;
}

/**
 * TipTap-based rich editor for template fields that need formatting
 * (bold, italic, lists, links) AND variable insertion.
 *
 * Keeps the serialized output as HTML with raw `{{variable.key}}` tokens
 * embedded in the text content, so the server-side `renderTemplate()`
 * can substitute them uniformly with the plain-text sites. We don't use
 * TipTap's Mention node wrapper here because the final HTML needs to
 * survive round-tripping through the email-send pipeline as plain tokens.
 *
 * The slash trigger is handled via an `editorProps.handleKeyDown` hook
 * — simpler than wiring the full `@tiptap/suggestion` plugin, and
 * enough for our "open popup at caret, insert token" flow.
 */
export function VariableRichEditor({
  value,
  onChange,
  context,
  dynamicVariables,
  placeholder,
  minHeight = 160,
  disabled,
}: VariableRichEditorProps) {
  const variables = useMemo(() => {
    const base = getVariablesForContext(context);
    return dynamicVariables ? [...base, ...dynamicVariables] : base;
  }, [context, dynamicVariables]);

  const [popupOpen, setPopupOpen] = useState(false);
  const [popupAnchor, setPopupAnchor] = useState<{ top: number; left: number } | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
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
      const normalized = html === '<p></p>' ? '' : html;
      onChange(normalized);
    },
    editorProps: {
      attributes: {
        class: 'variable-rich-editor',
        style: `min-height: ${minHeight}px; padding: 12px 14px; font-size: 14px; line-height: 1.6; color: var(--text-secondary); outline: none; cursor: text; background: ${disabled ? 'var(--bg-tertiary)' : 'var(--bg-primary)'};`,
      },
      handleKeyDown: (view, event) => {
        if (event.key !== '/' || popupOpen) return false;
        // Let TipTap insert the slash first, then open the popup.
        requestAnimationFrame(() => {
          const { from } = view.state.selection;
          const coords = view.coordsAtPos(from);
          setPopupAnchor({ top: coords.top + 4, left: coords.left });
          setPopupOpen(true);
        });
        return false; // allow slash to be inserted
      },
    },
  });

  // Keep editor content in sync with external value changes.
  useEffect(() => {
    if (!editor) return;
    const currentHtml = editor.getHTML();
    const normalizedCurrent = currentHtml === '<p></p>' ? '' : currentHtml;
    if (normalizedCurrent !== value) {
      editor.commands.setContent(value || '');
    }
  }, [editor, value]);

  const handleInsert = useCallback(
    (variable: VariableDefinition) => {
      if (!editor) return;
      // Delete the slash that triggered the popup, then insert the token.
      const { from } = editor.state.selection;
      editor
        .chain()
        .focus()
        .deleteRange({ from: from - 1, to: from })
        .insertContent(`{{${variable.key}}}`)
        .run();
      setPopupOpen(false);
    },
    [editor],
  );

  const openFromButton = useCallback(() => {
    if (!editor) return;
    const { from } = editor.state.selection;
    const coords = editor.view.coordsAtPos(from);
    // Insert a marker slash so insert logic can replace it consistently.
    editor.chain().focus().insertContent('/').run();
    setPopupAnchor({ top: coords.top + 4, left: coords.left });
    setPopupOpen(true);
  }, [editor]);

  if (!editor) {
    return (
      <div
        style={{
          minHeight,
          padding: 12,
          border: '1px solid var(--border-secondary)',
          borderRadius: 8,
          color: 'var(--text-placeholder)',
          fontSize: 13,
        }}
      >
        Loading editor...
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'relative',
        border: '1px solid var(--border-secondary)',
        borderRadius: 8,
        backgroundColor: 'var(--bg-primary)',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '6px 10px',
          borderBottom: '1px solid var(--border-primary)',
          backgroundColor: 'var(--bg-secondary)',
          flexWrap: 'wrap',
        }}
      >
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          title="Bold"
        >
          <b>B</b>
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          title="Italic"
        >
          <i>I</i>
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          title="Bullet list"
        >
          •
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          title="Numbered list"
        >
          1.
        </ToolbarBtn>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={openFromButton}
          title="Insert variable (or type /)"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            border: '1px solid var(--border-secondary)',
            borderRadius: 6,
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-secondary)',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Icon path={mdiCodeBraces} size={0.6} color="currentColor" />
          Variables
        </button>
      </div>
      <EditorContent editor={editor} />
      {!value && placeholder && (
        <div
          style={{
            position: 'absolute',
            top: 52,
            left: 16,
            color: 'var(--text-placeholder)',
            fontSize: 14,
            pointerEvents: 'none',
          }}
        >
          {placeholder}
        </div>
      )}

      {popupOpen && popupAnchor && (
        <VariablePopup
          variables={variables}
          query=""
          onInsert={handleInsert}
          onClose={() => setPopupOpen(false)}
          anchor={popupAnchor}
        />
      )}
    </div>
  );
}

function ToolbarBtn({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title?: string;
  children: React.ReactNode;
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
        borderColor: active ? 'var(--accent-primary-hover)' : 'var(--border-primary)',
        borderRadius: 4,
        backgroundColor: active ? 'var(--badge-indigo-bg)' : 'var(--bg-primary)',
        color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: active ? 700 : 400,
        minWidth: 24,
        height: 24,
      }}
    >
      {children}
    </button>
  );
}
