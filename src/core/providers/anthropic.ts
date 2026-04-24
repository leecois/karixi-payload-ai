import type { AIProvider } from '../../types.js'

type AnthropicMessage = {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }

type AnthropicResponse = {
  content: Array<{ type: string; text?: string }>
  usage?: { input_tokens: number; output_tokens: number }
}

function isAnthropicResponse(value: unknown): value is AnthropicResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'content' in value &&
    Array.isArray((value as AnthropicResponse).content)
  )
}

export type AnthropicProviderConfig = {
  apiKey: string
  model?: string
  baseUrl?: string
}

export function createAnthropicProvider(configOrKey: AnthropicProviderConfig | string): AIProvider {
  const config: AnthropicProviderConfig =
    typeof configOrKey === 'string' ? { apiKey: configOrKey } : configOrKey
  const apiKey = config.apiKey
  const model = config.model ?? 'claude-sonnet-4-20250514'
  const baseUrl = (config.baseUrl ?? 'https://api.anthropic.com').replace(/\/+$/, '')

  async function callAPI(messages: AnthropicMessage[]): Promise<AnthropicResponse> {
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        messages,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Anthropic API error ${response.status}: ${errorText}`)
    }

    const data: unknown = await response.json()
    if (!isAnthropicResponse(data)) {
      throw new Error('Unexpected Anthropic API response shape')
    }
    return data
  }

  return {
    async generate(prompt: string, _outputSchema: Record<string, unknown>): Promise<unknown[]> {
      const messages: AnthropicMessage[] = [
        {
          role: 'user',
          content: `${prompt}\n\nRespond with ONLY a valid JSON array. No markdown, no explanation, just the JSON array.`,
        },
      ]

      const data = await callAPI(messages)
      const textBlock = data.content.find((block) => block.type === 'text')
      if (!textBlock || !('text' in textBlock) || typeof textBlock.text !== 'string') {
        throw new Error('No text content in Anthropic response')
      }

      const text = textBlock.text.trim()
      // Strip markdown code fences if present
      const jsonText = text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim()

      const parsed: unknown = JSON.parse(jsonText)
      if (!Array.isArray(parsed)) {
        throw new Error('Anthropic response is not a JSON array')
      }
      return parsed
    },

    async analyzeImage(imageBuffer: Buffer): Promise<string> {
      const base64 = imageBuffer.toString('base64')
      // Detect image type from buffer magic bytes
      let mediaType = 'image/jpeg'
      if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) mediaType = 'image/png'
      else if (imageBuffer[0] === 0x47 && imageBuffer[1] === 0x49) mediaType = 'image/gif'
      else if (imageBuffer[0] === 0x52 && imageBuffer[1] === 0x49) mediaType = 'image/webp'

      const messages: AnthropicMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            {
              type: 'text',
              text: 'Describe this image concisely for use as alt text. Focus on the main subject and important visual details. Respond with only the alt text description, no extra explanation.',
            },
          ],
        },
      ]

      const data = await callAPI(messages)
      const textBlock = data.content.find((block) => block.type === 'text')
      if (!textBlock || !('text' in textBlock) || typeof textBlock.text !== 'string') {
        throw new Error('No text content in Anthropic image analysis response')
      }
      return textBlock.text.trim()
    },
  }
}
