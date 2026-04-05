import type { AIProvider } from '../../types.js'

type OpenAIMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string | OpenAIContentBlock[]
}

type OpenAIContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

type OpenAIResponse = {
  choices: Array<{
    message: { role: string; content: string | null }
  }>
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

function isOpenAIResponse(value: unknown): value is OpenAIResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'choices' in value &&
    Array.isArray((value as OpenAIResponse).choices)
  )
}

export function createOpenAIProvider(apiKey: string): AIProvider {
  async function callAPI(messages: OpenAIMessage[], jsonMode: boolean): Promise<OpenAIResponse> {
    const body: Record<string, unknown> = {
      model: 'gpt-4o',
      messages,
    }
    if (jsonMode) {
      body.response_format = { type: 'json_object' }
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenAI API error ${response.status}: ${errorText}`)
    }

    const data: unknown = await response.json()
    if (!isOpenAIResponse(data)) {
      throw new Error('Unexpected OpenAI API response shape')
    }
    return data
  }

  return {
    async generate(prompt: string, _outputSchema: Record<string, unknown>): Promise<unknown[]> {
      const messages: OpenAIMessage[] = [
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
        throw new Error('No content in OpenAI response')
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
      throw new Error('OpenAI response is not a JSON array')
    },

    async analyzeImage(imageBuffer: Buffer): Promise<string> {
      const base64 = imageBuffer.toString('base64')
      // Detect image type from buffer magic bytes
      let mediaType = 'image/jpeg'
      if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) mediaType = 'image/png'
      else if (imageBuffer[0] === 0x47 && imageBuffer[1] === 0x49) mediaType = 'image/gif'
      else if (imageBuffer[0] === 0x52 && imageBuffer[1] === 0x49) mediaType = 'image/webp'

      const dataUrl = `data:${mediaType};base64,${base64}`

      const messages: OpenAIMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: dataUrl },
            },
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
        throw new Error('No content in OpenAI image analysis response')
      }
      return choice.message.content.trim()
    },
  }
}
