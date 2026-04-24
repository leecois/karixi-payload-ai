/** Plugin configuration */
export type AIPluginConfig = {
  /** AI provider */
  provider: 'anthropic' | 'openai' | 'gemini' | 'ollama'
  /** Environment variable name for the API key */
  apiKeyEnvVar: string
  /** Base URL override for the AI provider (required for ollama, optional for gemini) */
  baseUrl?: string
  /** Model name override (defaults to a sensible model per provider) */
  model?: string
  /** Feature flags */
  features?: {
    /** Enable admin UI components (AI Fill buttons, bulk panel) */
    adminUI?: boolean
    /** Enable dev tools (screenshot, visual diff, form testing) */
    devTools?: boolean
  }
  /** Per-collection AI generation config */
  collections?: Record<string, CollectionAIConfig>
  /** Rate limiting */
  rateLimit?: {
    maxTokensPerBatch?: number
    delayBetweenRequests?: number
    maxConcurrentRequests?: number
  }
  /** Rollback on bulk generation failure */
  rollbackOnError?: boolean
  /** Max concurrent browser instances for dev tools */
  maxConcurrentBrowserInstances?: number
  /**
   * Extra collection slugs to mark as non-populatable. Merged with the
   * defaults (orders/carts/transactions) — use `replaceNonPopulatableDefaults`
   * to disable the defaults instead of merging.
   */
  nonPopulatableSlugs?: string[]
  /**
   * When true, replaces the hard-coded ecommerce defaults
   * (orders/carts/transactions) with your `nonPopulatableSlugs`.
   * Use this for non-ecommerce projects that don't want the built-in list.
   */
  replaceNonPopulatableDefaults?: boolean
  /**
   * Optional domain string forwarded as GenerationContext.domain —
   * replaces the default 'ecommerce platform' framing in generation
   * prompts. Pass an empty string to drop the framing entirely.
   */
  domain?: string
  /**
   * Custom FieldTypeAdapters for non-native Payload field types (e.g.
   * community plugins that introduce a 'slug' or 'geolocation' field
   * type). Each adapter supplies describe/outputSchema/validate/
   * postprocess hooks so the generator handles the type without core
   * modifications.
   *
   * Supplied adapters are merged with the built-in set; same-type keys
   * override built-ins (which is usually what you want when customizing).
   */
  fieldAdapters?: import('./core/field-adapters.js').FieldTypeAdapter[]
}

export type CollectionAIConfig = {
  /** Per-field AI generation config */
  fields?: Record<
    string,
    {
      enabled: boolean
      prompt?: string
    }
  >
}

/** AI Provider interface */
export interface AIProvider {
  generate(prompt: string, outputSchema: Record<string, unknown>): Promise<unknown[]>
  analyzeImage(imageBuffer: Buffer): Promise<string>
}

/** Analyzed collection schema */
export type CollectionSchema = {
  slug: string
  fields: FieldSchema[]
  relationships: RelationshipInfo[]
  requiredFields: string[]
  populatable: boolean
  lexicalFeatures?: string[]
}

/** Analyzed field schema */
export type FieldSchema = {
  name: string
  type: string
  required: boolean
  path: string
  options?: Array<{ label: string; value: string }>
  relationTo?: string | string[]
  hasMany?: boolean
  fields?: FieldSchema[]
  blocks?: BlockSchema[]
  lexicalFeatures?: string[]
  /** Field-level metadata harvested from Payload config (optional, additive) */
  metadata?: FieldMetadata
}

/** Analyzed block schema (reused across collections) */
export type BlockSchema = {
  slug: string
  fields: FieldSchema[]
  /** Human label from Payload config (optional) */
  label?: string
  /** Imagery/icon hint, if any */
  imageAltText?: string
  /** Slug-level description from Payload config (optional) */
  description?: string
  /** List of required field names at the block level */
  requiredFields?: string[]
}

/** Extra per-field hints harvested from Payload config */
export type FieldMetadata = {
  description?: string
  placeholder?: string
  defaultValue?: unknown
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  unique?: boolean
  readOnly?: boolean
  /** True when this field is marked localized in Payload config */
  localized?: boolean
  /** AI generation hint from admin.custom or field.custom (if present) */
  aiHint?: string
}

/** Relationship info between collections */
export type RelationshipInfo = {
  field: string
  collection: string | string[]
  hasMany: boolean
  isSelfReferential: boolean
}

/** Entry in the deletion log for rollback */
export type DeletionLogEntry = {
  collection: string
  id: string
  createdAt: Date
}

/** Progress event from bulk operations */
export type ProgressEvent = {
  phase: string
  collection: string
  created: number
  failed: number
  total: number
  elapsed: number
}
