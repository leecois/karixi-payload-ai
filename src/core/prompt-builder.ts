import type { CollectionSchema, FieldSchema } from '../types.js'

export type GenerationContext = {
  count: number
  theme?: string
  locale?: string
  existingIds?: Record<string, string[]>
}

function describeField(field: FieldSchema, existingIds?: Record<string, string[]>): string {
  const lines: string[] = []
  const required = field.required ? ' (required)' : ' (optional)'

  switch (field.type) {
    case 'text':
    case 'textarea':
    case 'email':
      lines.push(
        `- "${field.name}" (${field.type}${required}): Generate realistic ${field.type} content`,
      )
      break

    case 'number':
      lines.push(
        `- "${field.name}" (number${required}): Generate a realistic numeric value (e.g. price 1–999, quantity 1–100, rating 1–5)`,
      )
      break

    case 'checkbox':
      lines.push(`- "${field.name}" (boolean${required}): true or false`)
      break

    case 'date':
      lines.push(
        `- "${field.name}" (date${required}): ISO 8601 date string (e.g. "2024-06-15T10:00:00.000Z")`,
      )
      break

    case 'select': {
      const values = (field.options ?? []).map((o) => `"${o.value}"`).join(', ')
      lines.push(`- "${field.name}" (select${required}): Must be one of [${values}]`)
      break
    }

    case 'relationship': {
      const collections = Array.isArray(field.relationTo)
        ? field.relationTo
        : [field.relationTo ?? '']
      const idLists = collections.map((col) => {
        const ids = existingIds?.[col] ?? []
        return ids.length > 0
          ? `${col}: [${ids.map((id) => `"${id}"`).join(', ')}]`
          : `${col}: (no existing IDs available — omit this field)`
      })
      const hasIds = collections.some((col) => (existingIds?.[col] ?? []).length > 0)
      if (hasIds) {
        lines.push(
          `- "${field.name}" (relationship${required}): Pick from existing IDs — ${idLists.join('; ')}${field.hasMany ? ' (can be an array of IDs)' : ' (single ID string)'}`,
        )
      } else {
        lines.push(`- "${field.name}" (relationship${required}): SKIP — no existing IDs available`)
      }
      break
    }

    case 'richText':
      lines.push(
        `- "${field.name}" (richtext${required}): Return PLAIN TEXT only (do not wrap in Lexical/JSON — the system will convert it). Write 1–3 sentences of realistic content.`,
      )
      break

    case 'upload':
      lines.push(`- "${field.name}" (upload${required}): SKIP — handled separately`)
      break

    case 'array':
    case 'group':
      if (field.fields && field.fields.length > 0) {
        lines.push(`- "${field.name}" (${field.type}${required}):`)
        for (const subField of field.fields) {
          lines.push(`  ${describeField(subField, existingIds)}`)
        }
      }
      break

    case 'blocks':
      lines.push(`- "${field.name}" (blocks${required}): SKIP — complex layout field, omit`)
      break

    default:
      lines.push(`- "${field.name}" (${field.type}${required}): Generate appropriate content`)
  }

  return lines.join('\n')
}

export function buildGenerationPrompt(
  schema: CollectionSchema,
  context: GenerationContext,
): string {
  const fieldDescriptions = schema.fields
    .map((f) => describeField(f, context.existingIds))
    .join('\n')

  const requiredNote =
    schema.requiredFields.length > 0
      ? `\nRequired fields (must be present): ${schema.requiredFields.map((f) => `"${f}"`).join(', ')}`
      : ''

  const themeNote = context.theme ? `\nContent theme/style: ${context.theme}` : ''

  const localeNote =
    context.locale && context.locale !== 'en'
      ? `\nGenerate content in locale: ${context.locale}`
      : ''

  return `Generate ${context.count} realistic document(s) for the "${schema.slug}" collection.
${themeNote}${localeNote}${requiredNote}

Fields to generate:
${fieldDescriptions}

Rules:
- Return a JSON array with exactly ${context.count} item(s)
- Each item must be a flat JSON object with field names as keys
- Skip fields marked as SKIP
- For richtext fields: return plain text strings only
- For relationship fields: use the provided existing IDs exactly as shown
- Do not include extra fields not listed above
- Generate varied, realistic content appropriate for an ecommerce platform`
}

export function buildOutputSchema(schema: CollectionSchema): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  const required: string[] = []

  for (const field of schema.fields) {
    // Skip fields handled separately
    if (['relationship', 'richText', 'upload', 'blocks'].includes(field.type)) {
      continue
    }

    let fieldSchema: Record<string, unknown>

    switch (field.type) {
      case 'text':
      case 'textarea':
      case 'email':
      case 'date':
        fieldSchema = { type: 'string' }
        break

      case 'number':
        fieldSchema = { type: 'number' }
        break

      case 'checkbox':
        fieldSchema = { type: 'boolean' }
        break

      case 'select': {
        const enumValues = (field.options ?? []).map((o) => o.value)
        fieldSchema = { type: 'string', enum: enumValues }
        break
      }

      case 'array':
        fieldSchema = { type: 'array', items: { type: 'object' } }
        break

      case 'group':
        fieldSchema = { type: 'object' }
        break

      default:
        fieldSchema = { type: 'string' }
    }

    properties[field.name] = fieldSchema
    if (field.required) {
      required.push(field.name)
    }
  }

  return {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties,
          required,
        },
      },
    },
  }
}
