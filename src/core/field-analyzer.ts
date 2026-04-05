import type {
  ArrayField,
  BlocksField,
  CollapsibleField,
  Field,
  GroupField,
  RadioField,
  RelationshipField,
  RichTextField,
  RowField,
  SelectField,
  Tab,
  TabsField,
  UIField,
  UploadField,
} from 'payload'
import type { FieldSchema } from '../types.js'

function normalizeOptions(options: readonly unknown[]): Array<{ label: string; value: string }> {
  return options.map((opt) => {
    if (typeof opt === 'string') {
      return { label: opt, value: opt }
    }
    if (typeof opt === 'object' && opt !== null && 'value' in opt) {
      const o = opt as { label?: unknown; value: unknown }
      const label =
        typeof o.label === 'string'
          ? o.label
          : typeof o.label === 'object' && o.label !== null
            ? (Object.values(o.label)[0] ?? String(o.value))
            : String(o.value)
      return { label, value: String(o.value) }
    }
    return { label: String(opt), value: String(opt) }
  })
}

function buildPath(parentPath: string | undefined, name: string): string {
  return parentPath ? `${parentPath}.${name}` : name
}

function analyzeTabs(tabs: Tab[], parentPath?: string): FieldSchema[] {
  const result: FieldSchema[] = []
  for (const tab of tabs) {
    // Named tabs create a named path segment; unnamed tabs are transparent
    const tabName = 'name' in tab && typeof tab.name === 'string' ? tab.name : undefined
    const tabPath = tabName ? buildPath(parentPath, tabName) : parentPath
    result.push(...analyzeFields(tab.fields, tabPath))
  }
  return result
}

function isSelectField(field: Field): field is SelectField {
  return field.type === 'select'
}

function isRadioField(field: Field): field is RadioField {
  return field.type === 'radio'
}

function isRelationshipField(field: Field): field is RelationshipField {
  return field.type === 'relationship'
}

function isUploadField(field: Field): field is UploadField {
  return field.type === 'upload'
}

function isArrayField(field: Field): field is ArrayField {
  return field.type === 'array'
}

function isGroupField(field: Field): field is GroupField {
  return field.type === 'group'
}

function isCollapsibleField(field: Field): field is CollapsibleField {
  return field.type === 'collapsible'
}

function isRowField(field: Field): field is RowField {
  return field.type === 'row'
}

function isBlocksField(field: Field): field is BlocksField {
  return field.type === 'blocks'
}

function isTabsField(field: Field): field is TabsField {
  return field.type === 'tabs'
}

function isUIField(field: Field): field is UIField {
  return field.type === 'ui'
}

function isRichTextField(field: Field): field is RichTextField {
  return field.type === 'richText'
}

function detectLexicalFeatures(field: RichTextField): string[] {
  const features: string[] = []
  const editor = field.editor
  if (!editor || typeof editor !== 'object') return features
  // Lexical editor config is often stored in editor.editorConfig or similar
  // We do a best-effort detection via known property names
  const editorObj = editor as Record<string, unknown>
  const editorConfig = editorObj.editorConfig ?? editorObj.lexicalConfig ?? editorObj
  if (typeof editorConfig === 'object' && editorConfig !== null) {
    const cfg = editorConfig as Record<string, unknown>
    const featureList = cfg.features ?? cfg.resolvedFeatures
    if (Array.isArray(featureList)) {
      for (const f of featureList) {
        if (f && typeof f === 'object') {
          const fObj = f as Record<string, unknown>
          const key = fObj.key ?? fObj.feature ?? fObj.name
          if (typeof key === 'string') features.push(key)
        }
      }
    }
  }
  return features
}

export function analyzeFields(fields: Field[], parentPath?: string): FieldSchema[] {
  const result: FieldSchema[] = []

  for (const field of fields) {
    // Skip UI fields — they carry no data
    if (isUIField(field)) continue

    if (isTabsField(field)) {
      result.push(...analyzeTabs(field.tabs, parentPath))
      continue
    }

    if (isRowField(field) || isCollapsibleField(field)) {
      result.push(...analyzeFields(field.fields, parentPath))
      continue
    }

    // Fields from here need a name
    const namedField = field as Field & { name?: string }
    if (!('name' in namedField) || typeof namedField.name !== 'string') {
      // Unnamed group/collapsible already handled above; skip anything else unnamed
      continue
    }

    const name = namedField.name
    const path = buildPath(parentPath, name)
    const required = 'required' in field && field.required === true

    if (isRelationshipField(field)) {
      const _isSelfRef = false // computed in schema-reader at collection level
      const schema: FieldSchema = {
        name,
        type: 'relationship',
        required,
        path,
        relationTo: field.relationTo,
        hasMany: field.hasMany === true,
      }
      result.push(schema)
      continue
    }

    if (isUploadField(field)) {
      result.push({
        name,
        type: 'upload',
        required,
        path,
        relationTo: field.relationTo,
        hasMany: false,
      })
      continue
    }

    if (isSelectField(field)) {
      result.push({
        name,
        type: 'select',
        required,
        path,
        options: normalizeOptions(field.options),
        hasMany: field.hasMany === true,
      })
      continue
    }

    if (isRadioField(field)) {
      result.push({
        name,
        type: 'radio',
        required,
        path,
        options: normalizeOptions(field.options),
      })
      continue
    }

    if (isArrayField(field)) {
      const subFields = analyzeFields(field.fields, path)
      result.push({
        name,
        type: 'array',
        required,
        path,
        fields: subFields,
      })
      continue
    }

    if (isGroupField(field)) {
      // GroupField can be named or unnamed; we already checked name above
      const subFields = analyzeFields(field.fields as Field[], path)
      result.push({
        name,
        type: 'group',
        required,
        path,
        fields: subFields,
      })
      continue
    }

    if (isBlocksField(field)) {
      const blocks = field.blocks.map((block) => ({
        slug: block.slug,
        fields: analyzeFields(block.fields, path),
      }))
      result.push({
        name,
        type: 'blocks',
        required,
        path,
        blocks,
      })
      continue
    }

    if (isRichTextField(field)) {
      const lexicalFeatures = detectLexicalFeatures(field)
      result.push({
        name,
        type: 'richText',
        required,
        path,
        ...(lexicalFeatures.length > 0 ? { lexicalFeatures } : {}),
      })
      continue
    }

    // All remaining scalar field types
    result.push({
      name,
      type: field.type,
      required,
      path,
    })
  }

  return result
}
