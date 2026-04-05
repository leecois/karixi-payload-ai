import type { AIProvider, CollectionSchema, FieldSchema } from '../types.js'
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

function validateDocument(doc: unknown, schema: CollectionSchema): ValidationError[] {
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
    if (['relationship', 'richText', 'upload', 'blocks'].includes(field.type)) continue
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
  const outputSchema = buildOutputSchema(schema)

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
      const errors = validateDocument(item, schema)
      if (errors.length > 0) {
        allErrors.push(...errors)
      } else {
        validDocuments.push(item as Record<string, unknown>)
      }
    }

    if (allErrors.length === 0) {
      return { documents: validDocuments }
    }

    // Validation failed — retry if attempts remain
    if (attempt < maxRetries) {
      prompt = buildRetryPrompt(buildGenerationPrompt(schema, context), allErrors)
      lastError = new Error(`Validation failed: ${allErrors.map((e) => e.message).join('; ')}`)
      continue
    }

    // Out of retries — return what we have if any valid docs, otherwise throw
    if (validDocuments.length > 0) {
      return { documents: validDocuments }
    }

    throw new Error(
      `Content generation failed after ${maxRetries} retries. Last errors: ${allErrors.map((e) => e.message).join('; ')}`,
    )
  }

  throw lastError ?? new Error('Content generation failed')
}
