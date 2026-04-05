# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`@karixi/payload-ai` — an AI-powered data population and admin plugin for Payload CMS 3. It generates realistic content for collections via Anthropic or OpenAI, exposes MCP tools for Claude Code integration, and provides admin UI components for the Payload dashboard.

## Commands

```bash
bun run build        # tsc — compile to dist/
bun run typecheck    # tsc --noEmit
bun run test         # vitest run (all tests)
npx vitest run path/to/file.test.ts  # single test file
bun run lint         # biome check .
bun run lint:fix     # biome check --write .
bun run format       # biome format --write .
```

## Architecture

ESM package (`"type": "module"`) with `.js` extensions in all imports. Peer-depends on `payload` and `@payloadcms/plugin-mcp`.

### Layer structure

```
src/
  core/         Schema analysis + AI generation pipeline
  generate/     Document persistence, richtext, media, relationships
  orchestrate/  Multi-collection coordination
  admin/        React components + Payload hooks (client-side 'use client')
  mcp/          MCP protocol tools, prompts, resources
  dev/          Browser automation (optional Stagehand/Playwright)
```

### Data flow

1. **Schema reading**: `schema-reader.ts` uses `field-analyzer.ts` to convert Payload collection configs into normalized `CollectionSchema` objects
2. **Prompt building**: `prompt-builder.ts` turns schemas into structured AI prompts with per-field instructions and a JSON output schema
3. **Generation**: `content-generator.ts` calls an `AIProvider` (Anthropic or OpenAI), validates responses against the schema, and retries with error context
4. **Post-processing**: `richtext-generator.ts` converts plain text to Lexical JSON; `relationship-linker.ts` injects existing IDs; `variant-builder.ts` adds diversity
5. **Orchestration**: `dependency-resolver.ts` topologically sorts collections; `bulk-runner.ts` coordinates generation in order with `deletion-log.ts` for rollback

### Plugin wiring

`plugin.ts` wraps `Config` to inject hooks. `index.ts` is the public barrel export. MCP tools in `mcp/tools.ts` are registered via `@payloadcms/plugin-mcp`.

### Provider pattern

`core/providers/base.ts` is a factory that routes to `anthropic.ts` or `openai.ts` based on config. Both implement the `AIProvider` interface (generate + analyzeImage).

## Code Style

Enforced by Biome (`biome.json`):
- Single quotes, no semicolons, 2-space indent, trailing commas
- `import type` enforced for type-only imports
- Unused imports are errors; `noExplicitAny` and `noNonNullAssertion` are warnings
- Named exports only (no default exports)
- Function declarations for top-level, arrow functions for callbacks

## Key Types

Defined in `src/types.ts`: `AIPluginConfig`, `AIProvider` (interface), `CollectionSchema`, `FieldSchema`, `RelationshipInfo`, `DeletionLogEntry`, `ProgressEvent`.

Field types use Payload's casing: `'richText'` (not `'richtext'`), `'checkbox'` (not `'boolean'`).

## Test Files

Tests live in the project root as `*.test.ts` (not in a `__tests__` directory). Vitest with `globals: true` — no need to import `describe`/`it`/`expect`.
