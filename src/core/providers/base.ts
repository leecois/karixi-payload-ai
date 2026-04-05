import type { AIProvider } from '../../types.js'
import { createAnthropicProvider } from './anthropic.js'
import { createOpenAIProvider } from './openai.js'

export type { AIProvider }

export type ProviderConfig = {
  provider: 'anthropic' | 'openai'
  apiKey: string
}

export function createProvider(config: ProviderConfig): AIProvider {
  switch (config.provider) {
    case 'anthropic':
      return createAnthropicProvider(config.apiKey)
    case 'openai':
      return createOpenAIProvider(config.apiKey)
    default: {
      const _exhaustive: never = config.provider
      throw new Error(`Unknown provider: ${String(_exhaustive)}`)
    }
  }
}
