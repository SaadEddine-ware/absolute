# ABSOLUTE

AI CLI with neural memory. A local-first terminal assistant that remembers what you've worked on, detects context switches between topics, and keeps a browsable, searchable memory across sessions.

## Highlights

- **Neural memory** — every message is embedded (Cloudflare Workers AI or local transformers.js, BGE family) and stored with sqlite-vec for cosine-similarity recall.
- **Context tracking** — before each reply, `detectContext` scores the new prompt against the active goal and recent memory; it continues on-topic, or calls out a topic switch.
- **Cross-session recall** — similar past conversations are pulled into the system prompt, so a new session can pick up where an old one left off.
- **Transparent memory** — no tool-calling. SYNC embed/similarity runs before the LLM call (hard timeout), ASYNC keyword/extraction after the reply streams.
- **Adaptive threshold** — the switch sensitivity self-tunes via a learned EMA over your confirm/reject answers (clamped 0.3–0.9, default 0.6).
- **Full TUI + CLI** — a chat interface with session/memory browsers and a settings screen, plus a complete command surface for automation and diagnostics.

## Workspaces

| Package | Role |
| --- | --- |
| `packages/core` | SQLite + sqlite-vec storage, migrations, context detection, adaptive threshold, fetching, memory pipeline helpers |
| `packages/providers` | LLM provider abstraction (OpenAI, Anthropic, Mistral, Groq) with free-tier flags, streaming, key storage |
| `packages/cli` | `absolute` command line: sessions, config, worker/embedding, migrate, memory, doctor, export/import, provider |
| `packages/tui` | Ink-based chat UI with sidebar navigation and dedicated screens |

A Cloudflare Worker (`workers/`) hosts the embedding endpoint for `worker set cloud`.

## Setup

```sh
npm install
npm run build          # build all workspaces (or npm run build:core / npm run build:cli)
npm run typecheck      # tsc --noEmit across all workspaces
npm test -w @absolute/core
npm test -w @absolute/providers
```

Launch the TUI (also the default action with no subcommand):

```sh
node bin/absolute
```

## CLI

Run with `node bin/absolute <command>`.

```
absolute                        Launch the TUI chat interface
absolute session start          Start a new session (-t/--title)
absolute session list           List sessions (-n limit, default 20)
absolute session continue <id>  Continue a session
absolute session delete <id>    Delete a session
absolute config list            Show the whole config as JSON
absolute config get <key>       Get a config value (dot notation)
absolute config set <k> <v>     Set a config value, JSON-aware (saved to ~/.config/absolute/config.json)
absolute config path            Print the config file path
absolute worker status          Show embedding provider + vector-status summary
absolute worker set cloud <url> Embed via Cloudflare Worker (-t token, -y)
absolute worker set local       Embed via local transformers.js (-m model, -v verify, -y)
absolute migrate embeddings     Re-embed all memories/goals with the configured provider
absolute memory list [session]  List memories (optionally filtered by session id)
absolute memory show <id>       Show one memory, its metadata and children
absolute memory delete <id>     Delete a memory (confirmed)
absolute doctor                 Health check: config, DB, embeddings, counts, provider key, orphan vectors
absolute export [--file f] [--session s]  Export to JSON (vectors as base64)
absolute import <file> [--yes]  Import a JSON export (refuses on non-empty DB unless --yes)
absolute provider list          List LLM providers with free-tier + config status
absolute provider set <id> [key]  Save an API key and set the active provider
absolute provider test <id>     Send a tiny prompt to verify connectivity
```

Exit codes: `doctor` exits `1` when errors are found, `provider test` exits `1` on failure, `0` otherwise.

## TUI usage

The chat screen is the default view. Type a message and press enter; `esc` clears the input.

| Key | Action |
| --- | --- |
| `ctrl+t` | Chat |
| `ctrl+l` | Sessions browser |
| `ctrl+r` | Memories browser |
| `ctrl+e` | Settings / embedded-config |
| `tab` | Cycle views forward |
| `ctrl-c` | Quit |

Sessions screen: `↑`/`↓` select, `enter` open, `n` new, `d` delete (confirmed), `esc` back.
Memories screen: `↑`/`↓` select, `enter` expand/collapse, `esc` back.
Settings screen: `[c]` switch to cloud embedding, `[l]` switch to local, `[r]` reset threshold, `esc` back. Switching compares provider dimensions and runs the migration with confirmation.

Slash commands (in the chat input):

```
/help    show this help
/new     start a new session
/clear   clear the on-screen history
/embedded-config        open the embedding/memory settings screen
/sessions | /memories | /settings   jump to a screen
/quit    exit (or ctrl-c)
```

## Configuration

- Config file: `~/.config/absolute/config.json` (Windows: `%USERPROFILE%\.config\absolute\config.json`).
- Database: `~/.local/share/absolute/absolute.db`.
- API keys for LLM providers are stored in the OS keychain via keytar, with a 0600-permission file fallback outside the project directory — never in git-tracked files or the SQLite database.

Embedding provider is configured via `absolute worker set cloud <url> | local`. The provider's `modelId` + `dimensions` are recorded in the `embedding_metadata` singleton and validated on every startup; switching to a provider with different dimensions refuses to start until you run `absolute migrate embeddings` (the switch path does this for you with a confirmation).

## Architecture

- **Memory is transparent**: no MCP tools. The CLI embeds/scores before the LLM call and stores/refines after — this is why the earlier MCP approach was dropped.
- **Two-tier processing**: SYNC (embed, similarity) waits for the reply with a timeout and degrades to "continue without context check" if the provider hangs; ASYNC (keywords, summarization, memory storage) runs after the stream finishes.
- **Progressive loading**: session headers only (~500 bytes) are loaded at start; drill-down happens when more context is genuinely needed.
- **sqlite-vec**: vectors live in `vec0` virtual tables (`memory_vectors`, `goal_vectors`); all KNN search uses `WHERE embedding MATCH ? AND k = ? ORDER BY distance`. Triggers keep vector rows consistent on deletes.
- **Embedding provider interface**: every embedder implements `{ modelId, dimensions, embed(text): Promise<Float32Array> }`; nothing else depends on the specific provider.
- **Goal/memory schema**: hierarchical memory threads (`parent_id`), typed memory rows (`subject`, `action`, `sub_action`, `prompt_answer`), and a goal hierarchy — all per session, all browsable in the TUI.
- **Settings split**: `user_settings` holds typed core state (thresholds, switch counters); `settings` holds generic key-value preferences. Never overlap.

## Phase status

- ✅ Phase 1 — schema, migrations, progressive loading
- ✅ Phase 2 — embedding providers (Cloudflare Worker + local transformers.js)
- ✅ Phase 3 — adaptive threshold + context detection
- ✅ Phase 4 — TUI chat interface + memory pipeline
- ✅ Phase 5 — LLM provider layer, streaming, system-role partitioning
- ✅ Phase 6 — memory chat integration (SYNC recall, ASYNC store, cross-session KNN)
- ✅ Phase 7 — polish: CLI doctor/memory/export/import, TUI session/memory/settings screens, sidebar navigation
- ⏳ Phase 8 — goal tracking surfaced in the UI + hybrid confirmation prompt (planned)

## Rules that keep the memory intact

1. Never mix vector spaces — switching embedding providers always goes through the migration.
2. The startup guard refuses to run if the configured provider doesn't match `embedding_metadata`.
3. `export`/`import` carry the embedding metadata and refuse to import into a different vector space without an explicit migration.