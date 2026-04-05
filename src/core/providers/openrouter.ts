import type { AIProvider } from '../../types.js'

/**
 * OpenRouter provider — unified gateway to 300+ models from
 * Anthropic, OpenAI, Google, Meta, Mistral, DeepSeek, Qwen, and more.
 * Uses the OpenAI-compatible /v1/chat/completions endpoint.
 *
 * @see https://openrouter.ai/docs
 */

type ChatMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string | ContentBlock[]
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

type ChatResponse = {
  choices: Array<{
    message: { role: string; content: string | null }
    finish_reason: string | null
  }>
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

function isChatResponse(value: unknown): value is ChatResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'choices' in value &&
    Array.isArray((value as ChatResponse).choices)
  )
}

function detectMediaType(buffer: Buffer): string {
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png'
  if (buffer[0] === 0x47 && buffer[1] === 0x49) return 'image/gif'
  if (buffer[0] === 0x52 && buffer[1] === 0x49) return 'image/webp'
  return 'image/jpeg'
}

export type OpenRouterProviderConfig = {
  apiKey: string
  model?: string
  siteUrl?: string
  siteName?: string
}

export function createOpenRouterProvider(config: OpenRouterProviderConfig): AIProvider {
  const model = config.model ?? 'anthropic/claude-sonnet-4.6'

  async function callAPI(messages: ChatMessage[], jsonMode: boolean): Promise<ChatResponse> {
    const body: Record<string, unknown> = { model, messages }
    if (jsonMode) {
      body.response_format = { type: 'json_object' }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    }
    if (config.siteUrl) headers['HTTP-Referer'] = config.siteUrl
    if (config.siteName) headers['X-Title'] = config.siteName

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenRouter API error ${response.status}: ${errorText}`)
    }

    const data: unknown = await response.json()
    if (!isChatResponse(data)) {
      throw new Error('Unexpected OpenRouter API response shape')
    }
    return data
  }

  return {
    async generate(prompt: string, _outputSchema: Record<string, unknown>): Promise<unknown[]> {
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content:
            'You are a data generation assistant. Always respond with valid JSON only. When asked for an array, wrap it in {"items": [...]} so json_object mode is satisfied.',
        },
        {
          role: 'user',
          content: `${prompt}\n\nRespond with JSON object {"items": [...]} where items is the array of generated documents.`,
        },
      ]

      const data = await callAPI(messages, true)
      const choice = data.choices[0]
      if (!choice || choice.message.content === null) {
        throw new Error('No content in OpenRouter response')
      }

      if (choice.finish_reason === 'length') {
        throw new Error('OpenRouter response truncated — output may be incomplete')
      }

      const parsed: unknown = JSON.parse(choice.message.content)
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'items' in parsed &&
        Array.isArray((parsed as { items: unknown }).items)
      ) {
        return (parsed as { items: unknown[] }).items
      }
      if (Array.isArray(parsed)) {
        return parsed
      }
      throw new Error('OpenRouter response is not a JSON array')
    },

    async analyzeImage(imageBuffer: Buffer): Promise<string> {
      const base64 = imageBuffer.toString('base64')
      const mediaType = detectMediaType(imageBuffer)
      const dataUrl = `data:${mediaType};base64,${base64}`

      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUrl } },
            {
              type: 'text',
              text: 'Describe this image concisely for use as alt text. Focus on the main subject and important visual details. Respond with only the alt text description, no extra explanation.',
            },
          ],
        },
      ]

      const data = await callAPI(messages, false)
      const choice = data.choices[0]
      if (!choice || choice.message.content === null) {
        throw new Error('No content in OpenRouter image analysis response')
      }
      return (choice.message.content as string).trim()
    },
  }
}
