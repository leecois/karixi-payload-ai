import { describe, expect, it } from 'vitest'
import { contentToLexical, textToLexical } from './src/generate/richtext-generator.js'

describe('textToLexical', () => {
  it('converts a single line to a single paragraph', () => {
    const result = textToLexical('Hello world')
    expect(result.root.type).toBe('root')
    expect(result.root.children).toHaveLength(1)
    expect(result.root.children[0].type).toBe('paragraph')
    const para = result.root.children[0] as { type: string; children: unknown[] }
    expect(para.children).toHaveLength(1)
  })

  it('converts multiple lines to multiple paragraphs', () => {
    const result = textToLexical('Line one\nLine two\nLine three')
    expect(result.root.children).toHaveLength(3)
    result.root.children.forEach((child) => {
      expect(child.type).toBe('paragraph')
    })
  })

  it('produces valid Lexical root structure', () => {
    const result = textToLexical('Test')
    expect(result.root).toMatchObject({
      type: 'root',
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    })
  })

  it('produces valid paragraph node structure', () => {
    const result = textToLexical('Hello')
    const para = result.root.children[0]
    expect(para).toMatchObject({
      type: 'paragraph',
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    })
  })

  it('produces valid text node structure inside paragraph', () => {
    const result = textToLexical('Hello')
    const para = result.root.children[0] as { children: Record<string, unknown>[] }
    const textNode = para.children[0]
    expect(textNode).toMatchObject({
      type: 'text',
      text: 'Hello',
      mode: 'normal',
      style: '',
      detail: 0,
      format: 0,
      version: 1,
    })
  })

  it('handles empty string producing one empty paragraph', () => {
    const result = textToLexical('')
    expect(result.root.children).toHaveLength(1)
    const para = result.root.children[0] as { children: unknown[] }
    expect(para.children).toHaveLength(0)
  })
})

describe('contentToLexical', () => {
  it('converts a section with heading and paragraphs', () => {
    const result = contentToLexical({
      sections: [{ heading: 'My Heading', paragraphs: ['First paragraph', 'Second paragraph'] }],
    })
    const children = result.root.children
    expect(children[0].type).toBe('heading')
    expect(children[1].type).toBe('paragraph')
    expect(children[2].type).toBe('paragraph')
  })

  it('heading node has correct tag and text', () => {
    const result = contentToLexical({
      sections: [{ heading: 'Section Title', paragraphs: [] }],
    })
    const heading = result.root.children[0] as {
      type: string
      tag: string
      children: Array<{ text: string }>
    }
    expect(heading.type).toBe('heading')
    expect(heading.tag).toBe('h2')
    expect(heading.children[0].text).toBe('Section Title')
  })

  it('converts bullet points to a list node', () => {
    const result = contentToLexical({
      sections: [
        {
          paragraphs: ['Intro'],
          bulletPoints: ['Item one', 'Item two', 'Item three'],
        },
      ],
    })
    const children = result.root.children
    const listNode = children[children.length - 1] as {
      type: string
      listType: string
      tag: string
      children: unknown[]
    }
    expect(listNode.type).toBe('list')
    expect(listNode.listType).toBe('bullet')
    expect(listNode.tag).toBe('ul')
    expect(listNode.children).toHaveLength(3)
  })

  it('handles multiple sections', () => {
    const result = contentToLexical({
      sections: [
        { heading: 'Section 1', paragraphs: ['Para 1'] },
        { heading: 'Section 2', paragraphs: ['Para 2'] },
      ],
    })
    expect(result.root.children).toHaveLength(4) // h2 + p + h2 + p
  })

  it('skips heading when not provided', () => {
    const result = contentToLexical({
      sections: [{ paragraphs: ['Just a paragraph'] }],
    })
    expect(result.root.children).toHaveLength(1)
    expect(result.root.children[0].type).toBe('paragraph')
  })

  it('list items have correct structure', () => {
    const result = contentToLexical({
      sections: [{ paragraphs: [], bulletPoints: ['First', 'Second'] }],
    })
    const list = result.root.children[0] as {
      children: Array<{ type: string; value: number; children: Array<{ text: string }> }>
    }
    expect(list.children[0]).toMatchObject({ type: 'listitem', value: 1 })
    expect(list.children[1]).toMatchObject({ type: 'listitem', value: 2 })
    expect(list.children[0].children[0].text).toBe('First')
  })

  it('handles empty sections array', () => {
    const result = contentToLexical({ sections: [] })
    expect(result.root.children).toHaveLength(0)
  })
})
