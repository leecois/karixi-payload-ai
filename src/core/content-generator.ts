import { validateBlocks } from '../generate/block-generator.js'
import { contentToLexical, textToLexical } from '../generate/richtext-generator.js'
import type { AIProvider, CollectionSchema, FieldSchema } from '../types.js'
import type { FieldAdapterRegistry, ValidationIssue } from './field-adapters.js'
import type { GenerationContext } from './prompt-builder.js'
import { buildGenerationPrompt, buildOutputSchema } from './prompt-builder.js'

export type { GenerationContext }

export type GenerationResult = {
  documents: Record<string, unknown>[]
  tokensUsed?: number
}

type ValidationError = {
  field: string
  message: string
}

function getSelectValues(field: FieldSchema): string[] {
  return (field.options ?? []).map((o) => o.value)
}

/**
 * Convert richText values (strings or {sections:[...]} objects) into Lexical
 * JSON. Other values pass through unchanged. This is defensive — if the AI
 * returns something already shaped like Lexical (has `root`), we keep it.
 */
function convertRichTextValue(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return textToLexical(value)
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>
    if (v.root !== undefined) return v
    if (Array.isArray((v as { sections?: unknown }).sections)) {
      return contentToLexical(v as Parameters<typeof contentToLexical>[0])
    }
  }
  return value
}

/** Walk the generated doc and convert every richText field to Lexical. */
function applyRichTextPostprocess(
  doc: Record<string, unknown>,
  fields: FieldSchema[],
): Record<string, unknown> {
  for (const field of fields) {
    if (!(field.name in doc)) continue
    if (field.type === 'richText') {
      doc[field.name] = convertRichTextValue(doc[field.name])
      continue
    }
    if (field.type === 'group' && field.fields && typeof doc[field.name] === 'object') {
      const sub = doc[field.name] as Record<string, unknown> | null
      if (sub && !Array.isArray(sub)) applyRichTextPostprocess(sub, field.fields)
      continue
    }
    if (field.type === 'array' && field.fields && Array.isArray(doc[field.name])) {
      for (const item of doc[field.name] as unknown[]) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          applyRichTextPostprocess(item as Record<string, unknown>, field.fields)
        }
      }
    }
  }
  return doc
}

function validateDocument(
  doc: unknown,
  schema: CollectionSchema,
  options: { includeBlocks?: boolean; adapters?: FieldAdapterRegistry } = {},
): ValidationError[] {
  const errors: ValidationError[] = []

  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    return [{ field: '_root', message: 'Document must be a plain object' }]
  }

  const record = doc as Record<string, unknown>

  // Check required fields
  for (const fieldName of schema.requiredFields) {
    const field = schema.fields.find((f) => f.name === fieldName)
    if (!field) continue
    // Skip fields that are handled separately
    if (['relationship', 'richText', 'upload'].includes(field.type)) continue
    if (field.type === 'blocks' && !options.includeBlocks) continue
    if (record[fieldName] === undefined || record[fieldName] === null || record[fieldName] === '') {
      errors.push({
        field: fieldName,
        message: `Required field "${fieldName}" is missing or empty`,
      })
    }
  }

  // Validate select field values
  for (const field of schema.fields) {
    if (field.type !== 'select') continue
    const value = record[field.name]
    if (value === undefined || value === null) continue
    const validValues = getSelectValues(field)
    if (validValues.length > 0 && !validValues.includes(String(value))) {
      errors.push({
        field: field.name,
        message: `Field "${field.name}" has invalid select value "${String(value)}". Must be one of: ${validValues.join(', ')}`,
      })
    }
  }

  // Validate blocks fields when opted-in
  if (options.includeBlocks) {
    for (const field of schema.fields) {
      if (field.type !== 'blocks') continue
      const value = record[field.name]
      if (value === undefined) continue
      const { valid, issues } = validateBlocks(value, field)
      // Replace the raw value with the cleaned, validated array so downstream
      // Payload .create() receives only valid blocks.
      record[field.name] = valid
      for (const issue of issues) {
        errors.push({ field: issue.path, message: issue.message })
      }
    }
  }

  // Custom FieldTypeAdapter validators
  if (options.adapters) {
    for (const field of schema.fields) {
      const adapter = options.adapters.get(field.type)
      if (!adapter?.validate) continue
      const value = record[field.name]
      if (value === undefined) continue
      const adapterIssues: ValidationIssue[] = adapter.validate(value, field)
      for (const issue of adapterIssues) {
        errors.push({ field: issue.field, message: issue.message })
      }
    }
  }

  return errors
}

function buildRetryPrompt(originalPrompt: string, errors: ValidationError[]): string {
  const errorList = errors.map((e) => `- ${e.field}: ${e.message}`).join('\n')
  return `${originalPrompt}

IMPORTANT: Your previous response had validation errors. Fix these issues:
${errorList}

Return a corrected JSON array addressing all the errors above.`
}

export async function generateDocuments(
  provider: AIProvider,
  schema: CollectionSchema,
  context: GenerationContext,
  options?: { maxRetries?: number },
): Promise<GenerationResult> {
  const maxRetries = options?.maxRetries ?? 3
  const outputSchema = buildOutputSchema(schema, {
    includeBlocks: context.includeBlocks === true,
    adapters: context.adapters,
  })

  let prompt = buildGenerationPrompt(schema, context)
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let rawItems: unknown[]

    try {
      rawItems = await provider.generate(prompt, outputSchema)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < maxRetries) {
        prompt = buildRetryPrompt(buildGenerationPrompt(schema, context), [
          { field: '_generation', message: `API error: ${lastError.message}` },
        ])
        continue
      }
      throw lastError
    }

    // Validate all documents
    const allErrors: ValidationError[] = []
    const validDocuments: Record<string, unknown>[] = []

    for (const item of rawItems) {
      const errors = validateDocument(item, schema, {
        includeBlocks: context.includeBlocks === true,
        adapters: context.adapters,
      })
      if (errors.length > 0) {
        allErrors.push(...errors)
      } else {
        validDocuments.push(item as Record<string, unknown>)
      }
    }

    if (allErrors.length === 0) {
      return {
        documents: validDocuments.map((d) => applyRichTextPostprocess(d, schema.fields)),
      }
    }

    // Validation failed — retry if attempts remain
    if (attempt < maxRetries) {
      prompt = buildRetryPrompt(buildGenerationPrompt(schema, context), allErrors)
      lastError = new Error(`Validation failed: ${allErrors.map((e) => e.message).join('; ')}`)
      continue
    }

    // Out of retries — return what we have if any valid docs, otherwise throw
    if (validDocuments.length > 0) {
      return {
        documents: validDocuments.map((d) => applyRichTextPostprocess(d, schema.fields)),
      }
    }

    throw new Error(
      `Content generation failed after ${maxRetries} retries. Last errors: ${allErrors.map((e) => e.message).join('; ')}`,
    )
  }

  throw lastError ?? new Error('Content generation failed')
}
