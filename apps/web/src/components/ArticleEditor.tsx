'use client';

import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import ImageExtension from '@tiptap/extension-image';
import LinkExtension from '@tiptap/extension-link';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight } from 'lowlight';
import DOMPurify from 'dompurify';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ArticleEditorProps {
  initialContent?: string;
  onChange: (html: string) => void;
  editable?: boolean;
}

// ─── Lowlight setup ───────────────────────────────────────────────────────────

const lowlight = createLowlight();

// ─── DOMPurify config ─────────────────────────────────────────────────────────

const PURIFY_CONFIG: Parameters<typeof DOMPurify.sanitize>[1] = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'a', 'blockquote', 'pre', 'code',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'img', 'div', 'span',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'title', 'class', 'data-language'],
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
};

function sanitize(html: string): string {
  return DOMPurify.sanitize(html, PURIFY_CONFIG) as string;
}

// ─── Safe HTML Renderer (read-only mode) ─────────────────────────────────────

/**
 * Renders sanitized article HTML in read-only mode.
 * Content is first stripped by DOMPurify (FORBID_TAGS includes script/iframe/style/object/embed/form)
 * then mounted as a safe document fragment.
 */
function SafeArticleHtml({ html }: { html: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    // DOMPurify strips dangerous tags/attrs; result is safe to mount
    const clean = sanitize(html);
    const parser = new DOMParser();
    const doc = parser.parseFromString(clean, 'text/html');
    // Empty container, then append all safe body child nodes
    while (node.firstChild) node.removeChild(node.firstChild);
    Array.from(doc.body.childNodes).forEach((child) => node.appendChild(child));
  }, [html]);

  return (
    <div
      ref={containerRef}
      style={{ fontSize: 14, color: '#374151', lineHeight: 1.7 }}
    />
  );
}

// ─── Toolbar Button ───────────────────────────────────────────────────────────

function ToolbarButton({
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
        padding: '4px 8px',
        border: '1px solid',
        borderColor: isActive ? '#6366f1' : '#e5e7eb',
        borderRadius: 5,
        backgroundColor: isActive ? '#eef2ff' : '#fff',
        color: isActive ? '#4f46e5' : '#374151',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: isActive ? 700 : 400,
        minWidth: 30,
        height: 28,
        transition: 'all 0.1s ease',
      }}
    >
      {children}
    </button>
  );
}

// ─── ArticleEditor ────────────────────────────────────────────────────────────

/**
 * TipTap-based rich text editor for knowledge articles.
 *
 * Features: Bold, Italic, H1-H3, Bullet/Ordered list, Code block,
 * Link (URL input), Image (URL input), Blockquote.
 *
 * Output is DOMPurify-sanitized before emitting via onChange (XSS prevention
 * per 03-RESEARCH.md pitfall).
 */
export default function ArticleEditor({
  initialContent = '',
  onChange,
  editable = true,
}: ArticleEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      ImageExtension,
      LinkExtension.configure({ openOnClick: false }),
      CodeBlockLowlight.configure({ lowlight }),
    ],
    content: initialContent,
    editable,
    onUpdate: ({ editor: ed }) => {
      const sanitized = sanitize(ed.getHTML());
      onChange(sanitized);
    },
  });

  // Update content if initialContent changes externally
  useEffect(() => {
    if (editor && initialContent && editor.getHTML() !== initialContent) {
      editor.commands.setContent(initialContent);
    }
  }, [editor, initialContent]);

  const addLink = () => {
    const url = window.prompt('Enter URL:');
    if (!url) return;
    if (editor?.state.selection.empty) {
      editor.chain().focus().insertContent(`<a href="${url}">${url}</a>`).run();
    } else {
      editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  };

  const addImage = () => {
    const url = window.prompt('Enter image URL:');
    if (!url) return;
    editor?.chain().focus().setImage({ src: url }).run();
  };

  if (!editable) {
    return <SafeArticleHtml html={initialContent} />;
  }

  return (
    <div style={{ border: '1px solid #d1d5db', borderRadius: 10, overflow: 'hidden' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
          padding: '8px 10px',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb',
        }}
      >
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBold().run()}
          isActive={editor?.isActive('bold')}
          title="Bold"
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          isActive={editor?.isActive('italic')}
          title="Italic"
        >
          <em>I</em>
        </ToolbarButton>
        <div style={{ width: 1, backgroundColor: '#e5e7eb', margin: '0 2px' }} />
        {([1, 2, 3] as const).map((level) => (
          <ToolbarButton
            key={level}
            onClick={() => editor?.chain().focus().toggleHeading({ level }).run()}
            isActive={editor?.isActive('heading', { level })}
            title={`Heading ${level}`}
          >
            H{level}
          </ToolbarButton>
        ))}
        <div style={{ width: 1, backgroundColor: '#e5e7eb', margin: '0 2px' }} />
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          isActive={editor?.isActive('bulletList')}
          title="Bullet list"
        >
          &#x2022; List
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          isActive={editor?.isActive('orderedList')}
          title="Ordered list"
        >
          1. List
        </ToolbarButton>
        <div style={{ width: 1, backgroundColor: '#e5e7eb', margin: '0 2px' }} />
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
          isActive={editor?.isActive('codeBlock')}
          title="Code block"
        >
          {'</>'}
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          isActive={editor?.isActive('blockquote')}
          title="Blockquote"
        >
          &#x201C;
        </ToolbarButton>
        <div style={{ width: 1, backgroundColor: '#e5e7eb', margin: '0 2px' }} />
        <ToolbarButton onClick={addLink} isActive={editor?.isActive('link')} title="Insert link">
          Link
        </ToolbarButton>
        <ToolbarButton onClick={addImage} title="Insert image">
          Image
        </ToolbarButton>
      </div>

      {/* Editor area */}
      <EditorContent
        editor={editor}
        style={{
          padding: '14px 16px',
          minHeight: 300,
          fontSize: 14,
          lineHeight: 1.7,
          color: '#374151',
          cursor: 'text',
          backgroundColor: '#fff',
        }}
      />

      {/* Minimal prose styles injected inline */}
      <style>{`
        .ProseMirror:focus { outline: none; }
        .ProseMirror p { margin: 0 0 0.75em; }
        .ProseMirror h1 { font-size: 1.6em; font-weight: 700; margin: 0.75em 0 0.4em; }
        .ProseMirror h2 { font-size: 1.35em; font-weight: 700; margin: 0.75em 0 0.4em; }
        .ProseMirror h3 { font-size: 1.15em; font-weight: 600; margin: 0.75em 0 0.4em; }
        .ProseMirror ul, .ProseMirror ol { padding-left: 1.5em; margin: 0 0 0.75em; }
        .ProseMirror li { margin: 0.2em 0; }
        .ProseMirror pre { background: #f3f4f6; border-radius: 6px; padding: 12px; overflow-x: auto; font-size: 13px; }
        .ProseMirror code { background: #f3f4f6; padding: 1px 4px; border-radius: 3px; font-size: 0.9em; }
        .ProseMirror blockquote { border-left: 3px solid #d1d5db; margin: 0.75em 0; padding-left: 1em; color: #6b7280; }
        .ProseMirror a { color: #4f46e5; text-decoration: underline; }
        .ProseMirror img { max-width: 100%; border-radius: 6px; }
      `}</style>
    </div>
  );
}
