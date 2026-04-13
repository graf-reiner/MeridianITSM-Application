'use client';

import { useState, useCallback, useRef } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SSEEvent {
  type: 'token' | 'tool_call' | 'done' | 'error';
  content?: string;
  name?: string;
  args?: Record<string, unknown>;
  conversationId?: string;
  tokensUsed?: number;
  message?: string;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAiChat(options?: { apiBase?: string }) {
  const apiBase = options?.apiBase ?? '/api/v1/ai-chat';
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeToolCall, setActiveToolCall] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    setError(null);
    setIsStreaming(true);
    setActiveToolCall(null);

    // Add user message immediately
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Prepare assistant placeholder for streaming
    const assistantId = `assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '', createdAt: new Date().toISOString() },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const url = conversationId
        ? `${apiBase}/conversations/${conversationId}/messages`
        : `${apiBase}/conversations`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: text.trim() }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errData.error || `Request failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data) continue;

          let event: SSEEvent;
          try {
            event = JSON.parse(data) as SSEEvent;
          } catch {
            continue;
          }

          switch (event.type) {
            case 'token':
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: m.content + (event.content || '') } : m,
                ),
              );
              break;

            case 'tool_call':
              setActiveToolCall(event.name || null);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        toolCalls: [
                          ...(m.toolCalls || []),
                          { name: event.name || '', args: event.args || {} },
                        ],
                      }
                    : m,
                ),
              );
              break;

            case 'done':
              if (event.conversationId) {
                setConversationId(event.conversationId);
              }
              setActiveToolCall(null);
              break;

            case 'error':
              setError(event.message || 'An error occurred');
              break;
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'Failed to send message';
      setError(message);
      // Remove empty assistant message on error
      setMessages((prev) => prev.filter((m) => m.id !== assistantId || m.content));
    } finally {
      setIsStreaming(false);
      setActiveToolCall(null);
      abortRef.current = null;
    }
  }, [conversationId, isStreaming, apiBase]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const newConversation = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setError(null);
    setActiveToolCall(null);
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${apiBase}/conversations/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load conversation');
      const data = await res.json() as {
        id: string;
        messages: Array<{ id: string; role: string; content: string | null; createdAt: string }>;
      };
      setConversationId(data.id);
      setMessages(
        data.messages
          .filter((m) => m.role !== 'tool')
          .map((m) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content || '',
            createdAt: m.createdAt,
          })),
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversation');
    }
  }, [apiBase]);

  return {
    messages,
    conversationId,
    isStreaming,
    activeToolCall,
    error,
    sendMessage,
    stopStreaming,
    newConversation,
    loadConversation,
  };
}
