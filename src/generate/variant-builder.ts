import type { Payload, PayloadRequest } from 'payload'

export type VariantConfig = {
  types: Array<{
    name: string
    label: string
    options: Array<{ label: string; value: string }>
  }>
  generateAllCombinations?: boolean
  basePriceUSD: number
  baseInventory: number
}

export type VariantTreeResult = {
  variantTypeIds: string[]
  variantOptionIds: string[]
  variantIds: string[]
}

/** Generate all cartesian product combinations from arrays of option arrays */
function cartesian<T>(arrays: T[][]): T[][] {
  return arrays.reduce<T[][]>(
    (acc, arr) => acc.flatMap((combo) => arr.map((item) => [...combo, item])),
    [[]],
  )
}

/**
 * Build a variant tree for a product:
 * 1. Create variantType documents
 * 2. Create variantOption documents linked to types
 * 3. Create variant documents (combinations) linked to the product
 */
export async function buildVariantTree(
  payload: Payload,
  req: PayloadRequest,
  productId: string,
  config: VariantConfig,
): Promise<VariantTreeResult> {
  const variantTypeIds: string[] = []
  const variantOptionIds: string[] = []
  const variantIds: string[] = []

  // Step 1: Create variantType documents
  const typeOptionMap: Array<{
    typeId: string
    options: Array<{ id: string; value: string; label: string }>
  }> = []

  for (const typeConfig of config.types) {
    const variantType = await payload.create({
      collection: 'variant-types',
      data: {
        name: typeConfig.name,
        label: typeConfig.label,
      },
      overrideAccess: true,
      req,
    })

    const typeId = String(variantType.id)
    variantTypeIds.push(typeId)

    // Step 2: Create variantOption documents linked to this type
    const createdOptions: Array<{ id: string; value: string; label: string }> = []

    for (const opt of typeConfig.options) {
      const variantOption = await payload.create({
        collection: 'variant-options',
        data: {
          label: opt.label,
          value: opt.value,
          variantType: typeId,
        },
        overrideAccess: true,
        req,
      })

      const optId = String(variantOption.id)
      variantOptionIds.push(optId)
      createdOptions.push({ id: optId, value: opt.value, label: opt.label })
    }

    typeOptionMap.push({ typeId, options: createdOptions })
  }

  // Step 3: Generate variant combinations
  const optionArrays = typeOptionMap.map((t) => t.options)
  const combinations =
    config.generateAllCombinations !== false
      ? cartesian(optionArrays)
      : optionArrays.map((opts) => [opts[0]]).filter((combo) => combo[0] !== undefined)

  for (const combo of combinations) {
    // Build a label from the combination values
    const label = combo.map((opt) => opt.label).join(' / ')

    const variant = await payload.create({
      collection: 'variants',
      data: {
        label,
        product: productId,
        options: combo.map((opt) => opt.id),
        price: config.basePriceUSD,
        inventory: config.baseInventory,
      },
      overrideAccess: true,
      req,
    })

    variantIds.push(String(variant.id))
  }

  return { variantTypeIds, variantOptionIds, variantIds }
}
