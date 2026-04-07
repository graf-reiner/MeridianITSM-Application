'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Icon from '@mdi/react';
import { mdiClose, mdiSend, mdiStop, mdiRobotOutline, mdiMagnify, mdiPlus, mdiDelete, mdiBookOpenVariant } from '@mdi/js';
import { useAiChat, type ChatMessage, type Conversation } from '@/hooks/use-ai-chat';

// ─── Tool Call Display Names ─────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  query_database: 'Querying database',
  search_content: 'Searching content',
};

// ─── Message Component ───────────────────────────────────────────────────────

function ChatMessageBubble({ message, isStreaming }: { message: ChatMessage; isStreaming?: boolean }) {
  const isUser = message.role === 'user';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 12,
      }}
    >
      {/* Tool call indicators */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div style={{ marginBottom: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {message.toolCalls.map((tc, i) => (
            <div
              key={i}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 12,
                backgroundColor: 'var(--bg-tertiary)',
                fontSize: 12,
                color: 'var(--text-muted)',
              }}
            >
              <Icon path={mdiMagnify} size={0.5} color="currentColor" />
              {TOOL_LABELS[tc.name] || tc.name}
            </div>
          ))}
        </div>
      )}

      {/* Message bubble */}
      {message.content && (
        <div
          style={{
            maxWidth: '85%',
            padding: '10px 14px',
            borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
            backgroundColor: isUser ? 'var(--accent-brand)' : 'var(--bg-tertiary)',
            color: isUser ? '#fff' : 'var(--text-primary)',
            fontSize: 14,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {message.content}
          {isStreaming && !message.content && (
            <span style={{ opacity: 0.5 }}>Thinking...</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Input Component ─────────────────────────────────────────────────────────

function ChatInput({
  onSend,
  onStop,
  isStreaming,
  disabled,
}: {
  onSend: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    if (!text.trim() || isStreaming) return;
    onSend(text);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '40px';
    }
  }, [text, isStreaming, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = '40px';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 8,
        padding: '12px 16px',
        borderTop: '1px solid var(--border-primary)',
        backgroundColor: 'var(--bg-primary)',
      }}
    >
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder="Ask about your data..."
        disabled={disabled}
        rows={1}
        style={{
          flex: 1,
          resize: 'none',
          border: '1px solid var(--border-secondary)',
          borderRadius: 12,
          padding: '10px 14px',
          fontSize: 14,
          lineHeight: 1.4,
          fontFamily: 'inherit',
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          outline: 'none',
          height: 40,
          maxHeight: 120,
          overflow: 'auto',
        }}
      />
      <button
        onClick={isStreaming ? onStop : handleSend}
        disabled={!isStreaming && (!text.trim() || disabled)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: 'none',
          backgroundColor: isStreaming ? 'var(--accent-danger)' : 'var(--accent-brand)',
          color: '#fff',
          cursor: !isStreaming && !text.trim() ? 'not-allowed' : 'pointer',
          opacity: !isStreaming && !text.trim() ? 0.5 : 1,
          flexShrink: 0,
          transition: 'opacity 0.15s, background-color 0.15s',
        }}
        title={isStreaming ? 'Stop' : 'Send'}
      >
        <Icon path={isStreaming ? mdiStop : mdiSend} size={0.75} color="#fff" />
      </button>
    </div>
  );
}

// ─── Conversation List ───────────────────────────────────────────────────────

function ConversationList({
  onSelect,
  onNew,
  onClose,
}: {
  onSelect: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/ai-chat/conversations', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setConversations(data as Conversation[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await fetch(`/api/v1/ai-chat/conversations/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    setConversations((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: 'var(--bg-primary)',
        zIndex: 2,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-primary)',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
          Conversations
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { onNew(); onClose(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid var(--border-secondary)',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <Icon path={mdiPlus} size={0.6} color="currentColor" />
            New
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              color: 'var(--text-muted)',
            }}
          >
            <Icon path={mdiClose} size={0.8} color="currentColor" />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
        {loading && (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Loading...
          </div>
        )}
        {!loading && conversations.length === 0 && (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No conversations yet
          </div>
        )}
        {conversations.map((conv) => (
          <div
            key={conv.id}
            onClick={() => { onSelect(conv.id); onClose(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              borderRadius: 8,
              cursor: 'pointer',
              transition: 'background-color 0.1s',
              marginBottom: 2,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {conv.title || 'Untitled'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {new Date(conv.updatedAt).toLocaleDateString()}
              </div>
            </div>
            <button
              onClick={(e) => handleDelete(e, conv.id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                color: 'var(--text-muted)',
                opacity: 0.5,
                flexShrink: 0,
              }}
              title="Delete conversation"
            >
              <Icon path={mdiDelete} size={0.65} color="currentColor" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Welcome Suggestions ─────────────────────────────────────────────────────

const SUGGESTIONS = [
  'How many open tickets do I have?',
  'Show all production servers',
  'List computers with outdated OS',
  'Find knowledge articles about password resets',
];

function WelcomeView({ onSend }: { onSend: (text: string) => void }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        padding: 24,
        gap: 20,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          backgroundColor: 'var(--bg-tertiary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon path={mdiRobotOutline} size={1.3} color="var(--accent-brand)" />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
          AI Assistant
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 280 }}>
          Ask questions about your tickets, CMDB items, inventory, knowledge base, and more.
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 300 }}>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onSend(s)}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              border: '1px solid var(--border-secondary)',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: 13,
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'background-color 0.1s, border-color 0.1s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
              e.currentTarget.style.borderColor = 'var(--accent-brand)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
              e.currentTarget.style.borderColor = 'var(--border-secondary)';
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

export default function AiChatPanel({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const {
    messages,
    isStreaming,
    activeToolCall,
    error,
    sendMessage,
    stopStreaming,
    newConversation,
    loadConversation,
  } = useAiChat();

  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeToolCall]);

  return (
    <>
      {/* Backdrop overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            zIndex: 40,
            transition: 'opacity 0.25s',
          }}
        />
      )}

      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 420,
          maxWidth: '100vw',
          backgroundColor: 'var(--bg-primary)',
          borderLeft: '1px solid var(--border-primary)',
          boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.12)',
          zIndex: 41,
          display: 'flex',
          flexDirection: 'column',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.25s ease',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-primary)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon path={mdiRobotOutline} size={0.85} color="var(--accent-brand)" />
            <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>
              AI Assistant
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              onClick={() => setShowHistory(true)}
              title="Conversation history"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 6,
                borderRadius: 6,
                color: 'var(--text-muted)',
              }}
            >
              <Icon path={mdiBookOpenVariant} size={0.8} color="currentColor" />
            </button>
            <button
              onClick={newConversation}
              title="New conversation"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 6,
                borderRadius: 6,
                color: 'var(--text-muted)',
              }}
            >
              <Icon path={mdiPlus} size={0.8} color="currentColor" />
            </button>
            <button
              onClick={onClose}
              title="Close"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 6,
                borderRadius: 6,
                color: 'var(--text-muted)',
              }}
            >
              <Icon path={mdiClose} size={0.85} color="currentColor" />
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
          }}
        >
          {messages.length === 0 ? (
            <WelcomeView onSend={sendMessage} />
          ) : (
            <>
              {messages.map((msg) => (
                <ChatMessageBubble
                  key={msg.id}
                  message={msg}
                  isStreaming={isStreaming && msg === messages[messages.length - 1] && msg.role === 'assistant'}
                />
              ))}

              {/* Active tool call indicator */}
              {activeToolCall && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    borderRadius: 12,
                    backgroundColor: 'var(--bg-tertiary)',
                    fontSize: 13,
                    color: 'var(--text-muted)',
                    marginBottom: 8,
                    alignSelf: 'flex-start',
                  }}
                >
                  <span className="ai-chat-spinner" />
                  {TOOL_LABELS[activeToolCall] || activeToolCall}...
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}

          {/* Conversation history overlay */}
          {showHistory && (
            <ConversationList
              onSelect={loadConversation}
              onNew={newConversation}
              onClose={() => setShowHistory(false)}
            />
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div
            style={{
              padding: '8px 16px',
              backgroundColor: 'var(--accent-danger)',
              color: '#fff',
              fontSize: 13,
              flexShrink: 0,
            }}
          >
            {error}
          </div>
        )}

        {/* Input */}
        <ChatInput
          onSend={sendMessage}
          onStop={stopStreaming}
          isStreaming={isStreaming}
        />

        {/* Spinner animation */}
        <style>{`
          @keyframes ai-chat-spin {
            to { transform: rotate(360deg); }
          }
          .ai-chat-spinner {
            display: inline-block;
            width: 14px;
            height: 14px;
            border: 2px solid var(--border-secondary);
            border-top-color: var(--accent-brand);
            border-radius: 50%;
            animation: ai-chat-spin 0.6s linear infinite;
          }
        `}</style>
      </div>
    </>
  );
}
