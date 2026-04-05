/** Plugin configuration */
export type AIPluginConfig = {
  /** AI provider: 'anthropic' or 'openai' */
  provider: 'anthropic' | 'openai'
  /** Environment variable name for the API key */
  apiKeyEnvVar: string
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
  blocks?: Array<{ slug: string; fields: FieldSchema[] }>
  lexicalFeatures?: string[]
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
