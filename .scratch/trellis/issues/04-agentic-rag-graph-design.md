# 04 - Agentic RAG Graph Architecture (LangGraph)

- **Type**: `prototype`
- **Status**: `needs-triage`
- **Assignee**: Agentic Lead
- **Blocked by**: 03

## Question

How should the LangGraph agent state machine be structured to enforce structural guardrails?
1. **Decision Node**: Classify intent (conversational vs. workspace retrieval vs. action).
2. **Tool Execution Node**: Bind tools (`search_documents`, `get_tasks`, `get_team_summary`). Crucially: the tool receives the server-validated `AccessScope` directly from FastAPI context, NOT from LLM parameters.
3. **Relevancy & Groundedness Nodes**: Grade retrieved chunks and verify final generated answers strictly cite authorized chunks.
4. **Zero-Result & Refusal Handling**: Clear and safe responses when queries target out-of-scope data without leaking existence of unauthorized files.
