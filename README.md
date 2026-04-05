# @karixi/payload-ai

AI-powered data population and admin features for [Payload CMS 3](https://payloadcms.com).

Generate realistic content for any collection using Anthropic Claude or OpenAI — via MCP tools, the admin panel, or automatic hooks.

## Installation

```bash
bun add @karixi/payload-ai
```

Peer dependencies:

```bash
bun add payload @payloadcms/plugin-mcp
```

## Setup

This plugin has two parts:

1. **`aiPlugin`** — injects hooks into your Payload config (smart defaults, auto alt text)
2. **`getAITools` / `getAIPrompts` / `getAIResources`** — registers MCP tools inside `@payloadcms/plugin-mcp`

### Anthropic (Claude)

```ts
// payload.config.ts
import { buildConfig } from 'payload'
import { mcpPlugin } from '@payloadcms/plugin-mcp'
import { aiPlugin, getAITools, getAIPrompts, getAIResources } from '@karixi/payload-ai'

export default buildConfig({
  plugins: [
    // 1. AI plugin — hooks and admin features
    aiPlugin({
      provider: 'anthropic',
      apiKeyEnvVar: 'ANTHROPIC_API_KEY', // reads process.env.ANTHROPIC_API_KEY
      features: {
        adminUI: true,
        devTools: false,
      },
      rollbackOnError: true,
    }),

    // 2. MCP plugin — exposes AI tools to Claude Code / Claude Desktop
    mcpPlugin({
      collections: {
        posts: { enabled: true },
        categories: { enabled: true },
        media: { enabled: { find: true, create: false, update: false, delete: false } },
      },
      mcp: {
        tools: getAITools({
          provider: 'anthropic',
          apiKeyEnvVar: 'ANTHROPIC_API_KEY',
        }),
        prompts: getAIPrompts(),
        resources: getAIResources(),
      },
    }),
  ],
  // ...
})
```

### OpenAI

```ts
aiPlugin({
  provider: 'openai',
  apiKeyEnvVar: 'OPENAI_API_KEY',
  features: { adminUI: true },
}),

mcpPlugin({
  collections: { posts: { enabled: true } },
  mcp: {
    tools: getAITools({
      provider: 'openai',
      apiKeyEnvVar: 'OPENAI_API_KEY',
    }),
    prompts: getAIPrompts(),
    resources: getAIResources(),
  },
}),
```

> **Note:** `getAITools` requires the same `provider` and `apiKeyEnvVar` as `aiPlugin` so it can create the AI provider when tools are invoked. `getAIPrompts()` and `getAIResources()` take no arguments.

## Connecting Claude Code

After starting your Payload dev server:

```bash
# 1. Create an API key in the Payload admin panel (MCP > API Keys)
#    Enable the AI tools under the key's permissions

# 2. Register the MCP server with Claude Code
claude mcp add --transport http Payload http://localhost:3000/api/mcp \
  --header "Authorization: Bearer YOUR_MCP_API_KEY"
```

Then use natural language:

```
> Generate 10 blog posts about sustainable fashion
> Populate all collections with realistic sample data for an ecommerce demo
> Show me the schema for the products collection
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "Payload": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:3000/api/mcp",
        "--header",
        "Authorization: Bearer YOUR_MCP_API_KEY"
      ]
    }
  }
}
```

## MCP Tools

These tools are registered inside the MCP plugin and callable by any MCP client:

| Tool | Parameters | Description |
|------|------------|-------------|
| `populateCollection` | `collection`, `count`, `theme?` | Generate and insert N documents into a single collection |
| `bulkPopulate` | `theme`, `counts` | Populate multiple collections at once in dependency order |
| `getCollectionSchema` | `collection` | Return the analyzed field schema as JSON |
| `listCollections` | — | List all collections with field counts and populatable status |

### MCP Prompts

| Prompt | Args | Description |
|--------|------|-------------|
| `generateContentBrief` | `collection`, `theme`, `count` | Structured brief to guide content generation |
| `reviewGeneratedContent` | `collection`, `documentId` | Quality review of a generated document |

### MCP Resources

| Resource | URI | Description |
|----------|-----|-------------|
| `schemaOverview` | `schema://collections` | High-level overview of all collections |

## Features

### Admin UI (`features.adminUI: true`)

- **AI Fill** button on individual fields — generates a value with one click
- **Bulk Generate** panel — populate any collection with N documents
- **Smart defaults** — auto-fills empty fields on document creation via `beforeChange` hook
- **Image alt text** — generates alt text for uploaded media via `afterChange` hook

### Dev Tools (`features.devTools: true`)

Requires `@anthropic-ai/stagehand` (optional peer dependency):

```bash
bun add -d @anthropic-ai/stagehand
```

Adds four additional MCP tools:

| Tool | Description |
|------|-------------|
| `screenshot` | Capture page screenshots with viewport presets |
| `visual_diff` | Compare before/after screenshots for regressions |
| `test_form` | Fill and submit Payload admin forms programmatically |
| `edit_test_fix` | AI-driven screenshot → analyze → suggest fix loop |

## Plugin Configuration

```ts
aiPlugin({
  // Required
  provider: 'anthropic' | 'openai',
  apiKeyEnvVar: string,           // env var name (not the key itself)

  // Optional
  features: {
    adminUI: boolean,             // default: false
    devTools: boolean,            // default: false
  },
  collections: {
    posts: {
      fields: {
        title: { enabled: true, prompt: 'A compelling blog post title' },
        status: { enabled: false }, // skip this field
      },
    },
  },
  rateLimit: {
    maxTokensPerBatch: 100000,
    delayBetweenRequests: 200,    // ms
    maxConcurrentRequests: 3,
  },
  rollbackOnError: true,          // delete created docs if bulk generation fails
  maxConcurrentBrowserInstances: 2,
})
```

## How It Works

1. **Schema analysis** — reads your Payload collection configs and normalizes fields into a structured schema
2. **Dependency resolution** — topologically sorts collections so referenced collections are populated first
3. **Prompt building** — generates per-field AI instructions (respects select options, relationship IDs, richText handling)
4. **AI generation** — calls the configured provider, validates responses, retries with error context (up to 3 attempts)
5. **Post-processing** — converts plain text to Lexical JSON for richText fields, links relationships, adds content variation
6. **Rollback** — if `rollbackOnError` is enabled, deletes all created documents on failure

## Types

```ts
import type {
  AIPluginConfig,
  AIProvider,
  CollectionAIConfig,
  CollectionSchema,
  DeletionLogEntry,
  FieldSchema,
  ProgressEvent,
  RelationshipInfo,
} from '@karixi/payload-ai'
```

## Requirements

- Payload CMS ^3.81.0
- `@payloadcms/plugin-mcp` ^3.81.0
- Node.js 20+ or Bun 1.1+
- An Anthropic or OpenAI API key

## License

MIT
