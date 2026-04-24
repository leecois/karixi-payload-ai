import type { FieldSchema } from '../types.js'

/**
 * A FieldTypeAdapter is the extension seam for custom Payload field types.
 *
 * Every built-in type (text, number, select, relationship, blocks, ...) is
 * represented by an adapter. Downstream plugin users can register additional
 * adapters for custom field types (e.g. slug from @payloadcms/plugin-nested-docs,
 * code fields, geolocation) without modifying core.
 *
 * Adapters are looked up by field.type. If none matches, the core default
 * adapter is used.
 */
export type FieldTypeAdapter = {
  /** The Payload field.type string this adapter handles (e.g. 'text', 'slug') */
  type: string

  /**
   * Return a one-line prompt fragment describing this field to the AI.
   * Returning null signals "skip this field — do not include it in the
   * generation prompt" (used for blocks, upload, relationship which are
   * handled separately).
   */
  describe?: (field: FieldSchema, ctx: PromptContext) => string | null

  /**
   * Return a JSON-Schema fragment for this field, to be composed into the
   * top-level output schema. Returning null excludes the field from
   * structured output entirely.
   */
  outputSchema?: (field: FieldSchema) => Record<string, unknown> | null

  /**
   * Validate a raw generated value against the field. Return errors for
   * any problem found; empty array means valid.
   */
  validate?: (value: unknown, field: FieldSchema) => ValidationIssue[]

  /**
   * Optional: transform the raw generated value before persistence
   * (e.g. plain-text → Lexical JSON for richText fields).
   */
  postprocess?: (value: unknown, field: FieldSchema) => unknown
}

export type PromptContext = {
  existingIds?: Record<string, string[]>
  /** Optional domain hint ("ecommerce", "blog", "news site") */
  domain?: string
  /** Optional theme */
  theme?: string
}

export type ValidationIssue = {
  field: string
  message: string
}

export type FieldAdapterRegistry = {
  get(type: string): FieldTypeAdapter | undefined
  register(adapter: FieldTypeAdapter): void
  list(): FieldTypeAdapter[]
}

export function createRegistry(initial: FieldTypeAdapter[] = []): FieldAdapterRegistry {
  const table = new Map<string, FieldTypeAdapter>()
  for (const a of initial) table.set(a.type, a)

  return {
    get: (type) => table.get(type),
    register: (adapter) => {
      table.set(adapter.type, adapter)
    },
    list: () => [...table.values()],
  }
}

/** Helper: format the required/optional suffix used in describe() */
export function requiredSuffix(field: FieldSchema): string {
  return field.required ? ' (required)' : ' (optional)'
}

/** Helper: format field-level metadata hints as a trailing annotation */
export function formatMetadataHints(field: FieldSchema): string {
  const m = field.metadata
  if (!m) return ''
  const hints: string[] = []
  if (m.description) hints.push(m.description)
  if (m.aiHint) hints.push(`hint: ${m.aiHint}`)
  if (m.placeholder) hints.push(`example: ${m.placeholder}`)
  if (typeof m.minLength === 'number' || typeof m.maxLength === 'number') {
    hints.push(`length ${m.minLength ?? 0}–${m.maxLength ?? '∞'}`.replace('∞', 'unbounded'))
  }
  if (typeof m.min === 'number' || typeof m.max === 'number') {
    hints.push(`range ${m.min ?? '-∞'}–${m.max ?? '∞'}`)
  }
  if (m.unique) hints.push('must be unique')
  if (m.defaultValue !== undefined) {
    try {
      hints.push(`default: ${JSON.stringify(m.defaultValue)}`)
    } catch {
      /* unserializable default — skip */
    }
  }
  return hints.length > 0 ? ` [${hints.join('; ')}]` : ''
}
