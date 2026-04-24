import type { FieldSchema } from '../../types.js'
import { type FieldTypeAdapter, formatMetadataHints, requiredSuffix } from '../field-adapters.js'

const hints = formatMetadataHints
const req = requiredSuffix

function textLike(type: string, instruction: string): FieldTypeAdapter {
  return {
    type,
    describe(field) {
      return `- "${field.name}" (${type}${req(field)}): ${instruction}${hints(field)}`
    },
    outputSchema(field) {
      const schema: Record<string, unknown> = { type: 'string' }
      const m = field.metadata
      if (m?.minLength !== undefined) schema.minLength = m.minLength
      if (m?.maxLength !== undefined) schema.maxLength = m.maxLength
      return schema
    },
    validate(value, field) {
      if (value === undefined || value === null) return []
      if (typeof value !== 'string') {
        return [{ field: field.name, message: `expected string, got ${typeof value}` }]
      }
      const m = field.metadata
      if (m?.minLength !== undefined && value.length < m.minLength) {
        return [
          {
            field: field.name,
            message: `length ${value.length} below minLength ${m.minLength}`,
          },
        ]
      }
      if (m?.maxLength !== undefined && value.length > m.maxLength) {
        return [
          {
            field: field.name,
            message: `length ${value.length} above maxLength ${m.maxLength}`,
          },
        ]
      }
      return []
    },
  }
}

export const textAdapter = textLike('text', 'Generate realistic short text content')
export const textareaAdapter = textLike(
  'textarea',
  'Generate realistic multi-sentence text content',
)
export const emailAdapter: FieldTypeAdapter = {
  ...textLike('email', 'Generate a plausible email address'),
  validate(value, field) {
    if (value === undefined || value === null) return []
    if (typeof value !== 'string') {
      return [{ field: field.name, message: 'expected string' }]
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return [{ field: field.name, message: `not a valid email: ${value}` }]
    }
    return []
  },
}

export const numberAdapter: FieldTypeAdapter = {
  type: 'number',
  describe(field) {
    return `- "${field.name}" (number${req(field)}): Generate a realistic numeric value${hints(
      field,
    )}`
  },
  outputSchema(field) {
    const schema: Record<string, unknown> = { type: 'number' }
    const m = field.metadata
    if (m?.min !== undefined) schema.minimum = m.min
    if (m?.max !== undefined) schema.maximum = m.max
    return schema
  },
  validate(value, field) {
    if (value === undefined || value === null) return []
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return [{ field: field.name, message: `expected number, got ${typeof value}` }]
    }
    const m = field.metadata
    if (m?.min !== undefined && value < m.min) {
      return [{ field: field.name, message: `value ${value} below min ${m.min}` }]
    }
    if (m?.max !== undefined && value > m.max) {
      return [{ field: field.name, message: `value ${value} above max ${m.max}` }]
    }
    return []
  },
}

export const checkboxAdapter: FieldTypeAdapter = {
  type: 'checkbox',
  describe(field) {
    return `- "${field.name}" (boolean${req(field)}): true or false${hints(field)}`
  },
  outputSchema() {
    return { type: 'boolean' }
  },
  validate(value, field) {
    if (value === undefined || value === null) return []
    if (typeof value !== 'boolean') {
      return [{ field: field.name, message: `expected boolean, got ${typeof value}` }]
    }
    return []
  },
}

export const dateAdapter: FieldTypeAdapter = {
  type: 'date',
  describe(field) {
    return `- "${field.name}" (date${req(
      field,
    )}): ISO 8601 date string (e.g. "2024-06-15T10:00:00.000Z")${hints(field)}`
  },
  outputSchema() {
    return { type: 'string', format: 'date-time' }
  },
  validate(value, field) {
    if (value === undefined || value === null) return []
    if (typeof value !== 'string') {
      return [{ field: field.name, message: 'expected ISO date string' }]
    }
    const t = Date.parse(value)
    if (Number.isNaN(t)) {
      return [{ field: field.name, message: `unparseable date: ${value}` }]
    }
    return []
  },
}

export const selectAdapter: FieldTypeAdapter = {
  type: 'select',
  describe(field) {
    const values = (field.options ?? []).map((o) => `"${o.value}"`).join(', ')
    return `- "${field.name}" (select${req(field)}): Must be one of [${values}]${hints(field)}`
  },
  outputSchema(field) {
    const enumValues = (field.options ?? []).map((o) => o.value)
    const base: Record<string, unknown> = { type: 'string', enum: enumValues }
    return field.hasMany ? { type: 'array', items: base } : base
  },
  validate(value, field) {
    if (value === undefined || value === null) return []
    const valid = (field.options ?? []).map((o) => o.value)
    if (valid.length === 0) return []
    const check = (v: unknown) =>
      valid.includes(String(v))
        ? null
        : {
            field: field.name,
            message: `invalid select value "${String(v)}" — must be one of: ${valid.join(', ')}`,
          }
    if (field.hasMany && Array.isArray(value)) {
      return value.map(check).filter((e): e is NonNullable<typeof e> => e !== null)
    }
    const single = check(value)
    return single ? [single] : []
  },
}

export const radioAdapter: FieldTypeAdapter = {
  ...selectAdapter,
  type: 'radio',
  outputSchema(field) {
    const enumValues = (field.options ?? []).map((o) => o.value)
    return { type: 'string', enum: enumValues }
  },
}

/** Relationship, upload, richText and blocks are handled separately — these
 *  adapters describe them for the registry API but exclude them from output
 *  schema so that content-generator can route them through dedicated paths. */
export const relationshipAdapter: FieldTypeAdapter = {
  type: 'relationship',
  describe(field, ctx) {
    const collections = Array.isArray(field.relationTo)
      ? field.relationTo
      : [field.relationTo ?? '']
    const idLists = collections.map((col) => {
      const ids = ctx.existingIds?.[col] ?? []
      return ids.length > 0
        ? `${col}: [${ids.map((id) => `"${id}"`).join(', ')}]`
        : `${col}: (no existing IDs — omit this field)`
    })
    const hasIds = collections.some((col) => (ctx.existingIds?.[col] ?? []).length > 0)
    if (!hasIds) {
      return `- "${field.name}" (relationship${req(field)}): SKIP — no existing IDs available`
    }
    const multi = field.hasMany ? ' (can be an array of IDs)' : ' (single ID string)'
    return `- "${field.name}" (relationship${req(
      field,
    )}): Pick from existing IDs — ${idLists.join('; ')}${multi}${hints(field)}`
  },
  outputSchema: () => null,
}

export const uploadAdapter: FieldTypeAdapter = {
  type: 'upload',
  describe(field) {
    return `- "${field.name}" (upload${req(field)}): SKIP — media handled separately`
  },
  outputSchema: () => null,
}

export const richTextAdapter: FieldTypeAdapter = {
  type: 'richText',
  describe(field) {
    const features = field.lexicalFeatures ?? []
    if (features.length > 0) {
      return `- "${field.name}" (richtext${req(
        field,
      )}): Return a structured object {sections:[{heading?, paragraphs[], bulletPoints?}]}. The editor supports: ${features.join(
        ', ',
      )}.${hints(field)}`
    }
    return `- "${field.name}" (richtext${req(
      field,
    )}): Return PLAIN TEXT only (the system converts it to Lexical). Write 1–3 sentences.${hints(
      field,
    )}`
  },
  outputSchema: () => null,
}

export const blocksAdapter: FieldTypeAdapter = {
  type: 'blocks',
  // describe/outputSchema intentionally null — blocks handled by dedicated
  // block-generator module (next commit) to keep this step purely additive.
  describe: () => null,
  outputSchema: () => null,
}

export const arrayAdapter: FieldTypeAdapter = {
  type: 'array',
  // described via recursion in prompt-builder
  describe: () => null,
  outputSchema(field) {
    return {
      type: 'array',
      items: { type: 'object' },
      ...(field.metadata?.minLength !== undefined ? { minItems: field.metadata.minLength } : {}),
      ...(field.metadata?.maxLength !== undefined ? { maxItems: field.metadata.maxLength } : {}),
    }
  },
}

export const groupAdapter: FieldTypeAdapter = {
  type: 'group',
  describe: () => null,
  outputSchema: () => ({ type: 'object' }),
}

/** Generic fallback for unknown custom field types */
export const fallbackAdapter: FieldTypeAdapter = {
  type: '__fallback__',
  describe(field: FieldSchema) {
    return `- "${field.name}" (${field.type}${req(field)}): Generate appropriate content${hints(
      field,
    )}`
  },
  outputSchema: () => ({ type: 'string' }),
}

export function builtinAdapters(): FieldTypeAdapter[] {
  return [
    textAdapter,
    textareaAdapter,
    emailAdapter,
    numberAdapter,
    checkboxAdapter,
    dateAdapter,
    selectAdapter,
    radioAdapter,
    relationshipAdapter,
    uploadAdapter,
    richTextAdapter,
    blocksAdapter,
    arrayAdapter,
    groupAdapter,
  ]
}
