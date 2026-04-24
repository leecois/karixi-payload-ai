import type { BlockSchema, FieldSchema } from '../types.js'

/**
 * Block generation: turn a Blocks field definition into a JSON-Schema
 * discriminated union + prompt fragment, and validate generated values
 * back into shape.
 *
 * Blocks were previously marked SKIP across the pipeline. This module
 * lets prompt-builder + content-generator include them without forcing
 * any refactor of the existing switch-case: the top-level modules simply
 * call into this file when they see `field.type === 'blocks'`.
 */

/** JSON-Schema fragment describing the allowed shape of one blocks field. */
export function blocksOutputSchema(field: FieldSchema): Record<string, unknown> {
  const blocks = field.blocks ?? []
  if (blocks.length === 0) return { type: 'array', items: {} }

  const oneOf = blocks.map((block) => ({
    type: 'object',
    required: ['blockType'],
    properties: {
      blockType: { type: 'string', const: block.slug },
      ...blockFieldProperties(block),
    },
  }))

  return {
    type: 'array',
    items: {
      oneOf,
      discriminator: { propertyName: 'blockType' },
    },
  }
}

function blockFieldProperties(block: BlockSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of block.fields) {
    // Nested blocks/relationship/upload/richText: describe as string|object
    // for the LLM — full recursive lowering is out-of-scope for the first
    // cut (see roadmap).
    if (f.type === 'relationship' || f.type === 'upload') continue
    if (f.type === 'richText') {
      out[f.name] = { type: 'string' }
      continue
    }
    if (f.type === 'blocks') {
      out[f.name] = blocksOutputSchema(f)
      continue
    }
    if (f.type === 'array') {
      out[f.name] = { type: 'array', items: { type: 'object' } }
      continue
    }
    if (f.type === 'group') {
      out[f.name] = { type: 'object' }
      continue
    }
    if (f.type === 'select' || f.type === 'radio') {
      const values = (f.options ?? []).map((o) => o.value)
      out[f.name] = { type: 'string', enum: values }
      continue
    }
    if (f.type === 'number') {
      out[f.name] = { type: 'number' }
      continue
    }
    if (f.type === 'checkbox') {
      out[f.name] = { type: 'boolean' }
      continue
    }
    if (f.type === 'date') {
      out[f.name] = { type: 'string', format: 'date-time' }
      continue
    }
    out[f.name] = { type: 'string' }
  }
  return out
}

/** Prompt fragment describing a blocks field and its available block catalog. */
export function describeBlocksField(field: FieldSchema): string {
  const blocks = field.blocks ?? []
  if (blocks.length === 0) {
    return `- "${field.name}" (blocks${
      field.required ? ' (required)' : ' (optional)'
    }): empty block catalog — omit`
  }

  const lines: string[] = [
    `- "${field.name}" (blocks${
      field.required ? ' (required)' : ' (optional)'
    }): array of block objects. Each object MUST include a "blockType" discriminator string.`,
    '  Available block types:',
  ]

  for (const block of blocks) {
    const label = block.label ? ` (${block.label})` : ''
    const desc = block.description ? ` — ${block.description}` : ''
    lines.push(`  • blockType: "${block.slug}"${label}${desc}`)
    for (const f of block.fields) {
      const required = f.required ? ' (required)' : ''
      const suffix = describeBlockFieldInline(f)
      lines.push(`      - ${f.name} (${f.type}${required})${suffix}`)
    }
    if (block.requiredFields && block.requiredFields.length > 0) {
      lines.push(`      required: ${block.requiredFields.join(', ')}`)
    }
  }

  lines.push(
    `  Generate 2–5 blocks forming a coherent layout; mix block types if the theme permits.`,
  )
  return lines.join('\n')
}

function describeBlockFieldInline(f: FieldSchema): string {
  if (f.type === 'select' || f.type === 'radio') {
    const values = (f.options ?? []).map((o) => `"${o.value}"`).join(', ')
    return values ? ` — one of [${values}]` : ''
  }
  if (f.type === 'relationship') return ' — use an existing ID from related collections'
  if (f.type === 'upload') return ' — omit; media is attached separately'
  if (f.type === 'richText') return ' — plain text paragraph'
  if (f.type === 'number') return ' — numeric value'
  if (f.type === 'checkbox') return ' — boolean'
  if (f.type === 'date') return ' — ISO 8601 timestamp'
  if (f.type === 'blocks') return ' — nested block array'
  if (f.type === 'array') return ' — array of sub-objects'
  if (f.type === 'group') return ' — object of sub-fields'
  return ''
}

export type BlockValidationIssue = { path: string; message: string }

/**
 * Validate a generated blocks array against the schema. Drops blocks with
 * unknown blockType; reports missing required fields per block.
 * Returns { valid, issues } — `valid` is a cleaned array safe to persist.
 */
export function validateBlocks(
  value: unknown,
  field: FieldSchema,
): { valid: Array<Record<string, unknown>>; issues: BlockValidationIssue[] } {
  const issues: BlockValidationIssue[] = []
  if (!Array.isArray(value)) {
    if (value === undefined || value === null) return { valid: [], issues }
    return {
      valid: [],
      issues: [{ path: field.name, message: 'expected array of blocks' }],
    }
  }

  const catalog = new Map((field.blocks ?? []).map((b) => [b.slug, b]))
  const valid: Array<Record<string, unknown>> = []

  value.forEach((item, idx) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      issues.push({ path: `${field.name}[${idx}]`, message: 'block must be an object' })
      return
    }
    const obj = item as Record<string, unknown>
    const blockType = obj.blockType
    if (typeof blockType !== 'string') {
      issues.push({
        path: `${field.name}[${idx}]`,
        message: 'missing blockType discriminator',
      })
      return
    }
    const block = catalog.get(blockType)
    if (!block) {
      issues.push({
        path: `${field.name}[${idx}]`,
        message: `unknown blockType "${blockType}" — valid: ${[...catalog.keys()].join(', ')}`,
      })
      return
    }
    const missing = (block.requiredFields ?? []).filter((name) => {
      const v = obj[name]
      return v === undefined || v === null || v === ''
    })
    if (missing.length > 0) {
      issues.push({
        path: `${field.name}[${idx}]`,
        message: `${blockType} missing required: ${missing.join(', ')}`,
      })
      return
    }
    valid.push(obj)
  })

  return { valid, issues }
}
