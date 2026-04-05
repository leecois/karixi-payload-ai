# @karixi/payload-ai

AI-powered data population and admin features for Payload CMS 3.

## Installation

```bash
bun add @karixi/payload-ai
```

## Quick Start

```typescript
// payload.config.ts
import { buildConfig } from 'payload'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { mcpPlugin } from '@payloadcms/plugin-mcp'
import { aiPlugin, getAITools, getAIPrompts, getAIResources } from '@karixi/payload-ai'

export default buildConfig({
  plugins: [
    aiPlugin({
      provider: 'anthropic',
      apiKeyEnvVar: 'ANTHROPIC_API_KEY',
      features: {
        adminUI: true,
        devTools: false,
      },
      rollbackOnError: true,
    }),
    mcpPlugin({
      tools: (incomingTools) => [...incomingTools, ...getAITools()],
      prompts: (incomingPrompts) => [...incomingPrompts, ...getAIPrompts()],
      resources: (incomingResources) => [...incomingResources, ...getAIResources()],
    }),
  ],
  db: mongooseAdapter({ url: process.env.DATABASE_URI! }),
  collections: [/* your collections */],
})
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `populateCollection` | Generate N documents for any collection using AI |
| `bulkPopulate` | Populate the entire site in dependency order |
| `getCollectionSchema` | View the analyzed schema for a collection |
| `listCollections` | List all collections with their populatable status |

## Claude Code Integration

```bash
claude mcp add --transport http Payload http://localhost:3000/api/mcp \
  --header "Authorization: Bearer YOUR_API_KEY"
```

Then use natural language in Claude Code:

```
Generate 10 blog posts for the posts collection
Populate all collections with realistic sample data
```

## Features

### Admin UI (`features.adminUI: true`)

- **AI Fill** button on individual documents — generates field values with one click
- **Bulk Generate** panel — populate any collection with N documents from the admin panel
- **Smart defaults** — AI infers sensible values from field names and collection context
- **Image alt text** — automatically generates alt text for uploaded media

### Dev Tools (`features.devTools: true`)

Requires `@anthropic-ai/stagehand` (optional peer dependency).

- `screenshot` — capture screenshots of your frontend
- `visual_diff` — compare before/after screenshots to catch regressions
- `test_form` — fill and submit forms programmatically
- `edit_test_fix` — AI-driven edit → test → fix loop for frontend issues

## Plugin Configuration

```typescript
aiPlugin({
  provider: 'anthropic' | 'openai',    // AI provider
  apiKeyEnvVar: string,                 // env var name for the API key
  features: {
    adminUI: boolean,                   // default: false
    devTools: boolean,                  // default: false
  },
  collections: {
    posts: {
      fields: {
        title: { enabled: true, prompt: 'A compelling blog post title' },
        status: { enabled: false },
      },
    },
  },
  rateLimit: {
    maxTokensPerBatch: 100000,
    delayBetweenRequests: 200,          // ms
    maxConcurrentRequests: 3,
  },
  rollbackOnError: true,                // delete created docs if bulk run fails
  maxConcurrentBrowserInstances: 2,    // for dev tools
})
```

## API

### Plugin entry points

```typescript
import { aiPlugin } from '@karixi/payload-ai'
import { getAITools } from '@karixi/payload-ai'
import { getAIPrompts } from '@karixi/payload-ai'
import { getAIResources } from '@karixi/payload-ai'
```

### Types

```typescript
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

### Core utilities (advanced)

```typescript
// Analyze collection fields into a structured schema
import { analyzeFields } from '@karixi/payload-ai/core/field-analyzer'

// Resolve creation order for collections with relationships
import { resolveCreationOrder, getDependencies } from '@karixi/payload-ai/core/dependency-resolver'

// Convert plain text or structured content to Lexical rich text format
import { textToLexical, contentToLexical } from '@karixi/payload-ai/generate/richtext-generator'
```

## Requirements

- `payload` ^3.79.0
- `@payloadcms/plugin-mcp` ^3.79.0
- Node.js 20+ or Bun 1.1+
- Optional: `@anthropic-ai/stagehand` (for dev tools feature)

## Development

```bash
bun run build        # compile TypeScript
bun run typecheck    # type-check without emitting
bun run test         # run unit tests
```
