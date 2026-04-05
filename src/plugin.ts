import type { CollectionConfig, Config, Payload } from 'payload'
import { createAltTextHook } from './admin/hooks/afterUpload.js'
import { createSmartDefaultsHook } from './admin/hooks/beforeChange.js'
import type { AIPluginConfig } from './types.js'

/**
 * Payload AI Plugin — adds AI-powered data generation and admin features.
 * Auto-injects MCP custom tools if @payloadcms/plugin-mcp is present.
 */
export function aiPlugin(config: AIPluginConfig) {
  return (incomingConfig: Config): Config => {
    // Validate API key env var exists at init time
    const apiKey = process.env[config.apiKeyEnvVar]
    if (!apiKey) {
      console.warn(
        `[@karixi/payload-ai] Warning: ${config.apiKeyEnvVar} environment variable is not set. AI features will not work.`,
      )
    }

    const existingOnInit = incomingConfig.onInit

    // TODO Phase 2: Inject schema introspection + AI generation
    // TODO Phase 3: Register MCP custom tools (auto-detect mcpPlugin)

    let collections = incomingConfig.collections

    if (config.features?.adminUI && collections) {
      collections = collections.map((collection: CollectionConfig) => {
        const slug = collection.slug
        const updatedHooks = { ...collection.hooks }

        // Add beforeChange smart defaults hook for configured collections
        if (config.collections?.[slug]) {
          updatedHooks.beforeChange = [
            ...(updatedHooks.beforeChange ?? []),
            createSmartDefaultsHook(config, slug),
          ]
        }

        // Add afterChange alt text hook for media collection
        if (slug === 'media') {
          updatedHooks.afterChange = [
            ...(updatedHooks.afterChange ?? []),
            createAltTextHook(config),
          ]
        }

        if (
          updatedHooks.beforeChange !== collection.hooks?.beforeChange ||
          updatedHooks.afterChange !== collection.hooks?.afterChange
        ) {
          return { ...collection, hooks: updatedHooks }
        }

        return collection
      })
    }

    return {
      ...incomingConfig,
      collections,
      onInit: async (payload: Payload) => {
        if (existingOnInit) await existingOnInit(payload)
        console.log(`[@karixi/payload-ai] Plugin initialized. Provider: ${config.provider}`)
        // TODO Phase 4: Initialize admin UI components
        // TODO Phase 5: Initialize dev tools
      },
    }
  }
}
