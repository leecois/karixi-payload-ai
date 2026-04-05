import type { Payload } from 'payload'
import type { CollectionSchema, FieldSchema, RelationshipInfo } from '../types.js'
import { analyzeFields } from './field-analyzer.js'

/** Collections that should not be auto-populated by default */
const NON_POPULATABLE_SLUGS = new Set(['orders', 'carts', 'transactions'])

export type SchemaReaderOptions = {
  /** Override which slugs are considered non-populatable */
  nonPopulatableSlugs?: string[]
}

function extractRelationships(fields: FieldSchema[], collectionSlug: string): RelationshipInfo[] {
  const result: RelationshipInfo[] = []

  for (const field of fields) {
    if (field.type === 'relationship' || field.type === 'upload') {
      if (field.relationTo !== undefined) {
        const collections = Array.isArray(field.relationTo) ? field.relationTo : [field.relationTo]

        for (const col of collections) {
          result.push({
            field: field.path,
            collection: field.relationTo,
            hasMany: field.hasMany === true,
            isSelfReferential: col === collectionSlug,
          })
        }
      }
    }

    // Recurse into nested fields
    if (field.fields && field.fields.length > 0) {
      result.push(...extractRelationships(field.fields, collectionSlug))
    }

    if (field.blocks) {
      for (const block of field.blocks) {
        result.push(...extractRelationships(block.fields, collectionSlug))
      }
    }
  }

  return result
}

function collectRequiredPaths(fields: FieldSchema[]): string[] {
  const required: string[] = []
  for (const field of fields) {
    if (field.required) required.push(field.path)
    if (field.fields) required.push(...collectRequiredPaths(field.fields))
    if (field.blocks) {
      for (const block of field.blocks) {
        required.push(...collectRequiredPaths(block.fields))
      }
    }
  }
  return required
}

function collectLexicalFeatures(fields: FieldSchema[]): string[] {
  const features: string[] = []
  for (const field of fields) {
    if (field.type === 'richText' && field.lexicalFeatures) {
      features.push(...field.lexicalFeatures)
    }
    if (field.fields) features.push(...collectLexicalFeatures(field.fields))
    if (field.blocks) {
      for (const block of field.blocks) {
        features.push(...collectLexicalFeatures(block.fields))
      }
    }
  }
  return [...new Set(features)]
}

export function readCollectionSchema(
  payload: Payload,
  slug: string,
  options?: SchemaReaderOptions,
): CollectionSchema {
  const collection = payload.collections[slug]
  if (!collection) {
    throw new Error(`Collection "${slug}" not found in payload.collections`)
  }

  const config = collection.config
  const fields = analyzeFields(config.fields)

  const nonPopulatable = new Set([
    ...NON_POPULATABLE_SLUGS,
    ...(options?.nonPopulatableSlugs ?? []),
  ])

  const relationships = extractRelationships(fields, slug)
  const requiredFields = collectRequiredPaths(fields)
  const lexicalFeatures = collectLexicalFeatures(fields)

  return {
    slug,
    fields,
    relationships,
    requiredFields,
    populatable: !nonPopulatable.has(slug),
    ...(lexicalFeatures.length > 0 ? { lexicalFeatures } : {}),
  }
}

export function readAllCollectionSchemas(
  payload: Payload,
  options?: SchemaReaderOptions,
): CollectionSchema[] {
  const slugs = Object.keys(payload.collections)
  return slugs.map((slug) => readCollectionSchema(payload, slug, options))
}
