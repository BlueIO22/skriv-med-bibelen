# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev          # Start dev server (Next.js 16)
npm run build        # Production build
npm run lint         # ESLint
npm run generate-embeddings  # Generate Bible verse embeddings (Supabase pgvector)
```

## Architecture

**"Skriv med Bibelen"** is a Norwegian sermon-writing assistant for pastors (prester) in Den norske kirke (DNK). Pastors prepare sermons through a 4-step workflow: *tekststudie → forbindelser → disposisjon → utkast*, each step backed by a specialized AI prompt.

### Stack
- **Next.js 16.2.1** with React 19 and React Compiler (`reactCompiler: true` in `next.config.ts`) — see `node_modules/next/dist/docs/` for current API
- **Tailwind CSS v4** (PostCSS plugin, not v3 config style)
- **TypeScript**, **Tiptap** (rich text editor), **FontAwesome**, **react-markdown**

### External services
| Service | Purpose | Config |
|---|---|---|
| **Supabase** | Bible verse DB (`verse_chapter_book_references`), church year (`church_year_day`), semantic search RPC (`match_verses`) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` env vars |
| **Sanity** | CMS for Foross posts/podcasts linked to church year days | Project `903wnv01`, dataset `production`, hardcoded in `src/lib/sanity.ts` |
| **OpenAI** | `gpt-4o` for chat, `text-embedding-3-small` (512 dim) for verse embeddings | `OPENAI_API_KEY` env var |

### API routes (`src/app/api/`)
- `sermon/texts` — fetches lectionary texts (OT, epistle, gospel) from Supabase for a given date/series/tekstrekke
- `sermon/chat` — **streaming** step-aware AI chat; injects Sunday context + semantic verse search into system prompt
- `sermon/search` — semantic Bible verse search via embeddings
- `church-year` — church year day lookup + related Sanity posts/podcasts
- `chat` — general Bible/Foross chat (reads Sanity content, does verse search)
- `verses` — fetch specific verses by reference string

### Key data flow
1. `SermonBuilder.tsx` (client component) loads Sunday data via `/api/sermon/texts`
2. User works through steps; notes stored in `SermonDraft` (localStorage or state) per step
3. Each chat message hits `/api/sermon/chat` with the active `step`, full `SermonContext` (including prior step notes), and message history
4. The API embeds the last user message, finds semantically similar verses via Supabase `match_verses` RPC, and builds a step-specific system prompt before calling OpenAI streaming

### Bible reference normalization
`src/lib/book-abbreviations.ts` handles conversion between:
- Church year reference format (used in `church_year_day` table, e.g., comma-separated segments)
- Supabase `newname` column (Norwegian full book names, e.g., `"1. Mosebok"`)
- Sanity `bibleBook` slugs (e.g., `"1-mosebok"`)

Numbers before book names always use dot notation (`1. Kor`, not `1 Kor`) — this is enforced in all AI system prompts.

### Domain language (Norwegian)
- *Tekststudie* = exegesis / text study
- *Forbindelser* = biblical connections / parallels
- *Disposisjon* = sermon outline
- *Utkast* = draft
- *Tekstrekke* = lectionary series (1, 2, or 3)
- *Kirkeårdag* = church year day
- *Foross* = the content platform whose posts/podcasts are surfaced via Sanity
