# MeridianITSM — TODO

## AI Chatbot

### Priority
- [ ] **Rate limiting / token tracking** — Enforce per-tenant daily token budgets to prevent runaway OpenAI API costs. Track usage in Redis (`ai:tokens:{tenantId}:{date}`), store per-message in `ChatMessage.tokenUsage`. Business: 100K tokens/day, Enterprise: 500K tokens/day.
- [ ] **Conversation cleanup** — Auto-purge conversations older than 90 days. Add bulk delete option in the chat panel history view.

### Nice-to-Have
- [ ] **pgvector semantic search** — Add vector embeddings for semantic similarity search ("find tickets similar to X"). Requires pgvector extension, embedding generation on create/update, cosine similarity queries.
- [ ] **Contextual suggestions** — Show suggested questions based on the current dashboard page (e.g., on CMDB page suggest "Show all servers with expiring warranties").
- [ ] **Export / action buttons** — Add buttons on AI responses to export results as CSV or pre-fill a new ticket from findings.
- [ ] **Admin token usage dashboard** — Settings page showing AI token consumption over time per tenant, with charts and daily/monthly breakdowns.
