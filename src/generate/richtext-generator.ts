/** Lexical rich text node types */

export type LexicalTextNode = {
  detail: number
  format: number
  mode: 'normal'
  style: string
  text: string
  type: 'text'
  version: 1
}

export type LexicalParagraph = {
  children: LexicalTextNode[]
  direction: 'ltr'
  format: ''
  indent: 0
  type: 'paragraph'
  version: 1
}

export type LexicalHeading = {
  children: LexicalTextNode[]
  direction: 'ltr'
  format: ''
  indent: 0
  type: 'heading'
  tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  version: 1
}

export type LexicalListItem = {
  children: LexicalTextNode[]
  direction: 'ltr'
  format: ''
  indent: 0
  type: 'listitem'
  value: number
  version: 1
}

export type LexicalList = {
  children: LexicalListItem[]
  direction: 'ltr'
  format: ''
  indent: 0
  type: 'list'
  listType: 'bullet' | 'number'
  tag: 'ul' | 'ol'
  version: 1
}

export type LexicalNode =
  | LexicalParagraph
  | LexicalHeading
  | LexicalList
  | LexicalListItem
  | LexicalTextNode

export type LexicalRoot = {
  root: {
    children: Array<LexicalParagraph | LexicalHeading | LexicalList>
    direction: 'ltr'
    format: ''
    indent: 0
    type: 'root'
    version: 1
  }
}

function makeTextNode(text: string, format = 0): LexicalTextNode {
  return {
    detail: 0,
    format,
    mode: 'normal',
    style: '',
    text,
    type: 'text',
    version: 1,
  }
}

function makeParagraph(text: string): LexicalParagraph {
  return {
    children: text.length > 0 ? [makeTextNode(text)] : [],
    direction: 'ltr',
    format: '',
    indent: 0,
    type: 'paragraph',
    version: 1,
  }
}

function makeHeading(text: string, tag: LexicalHeading['tag'] = 'h2'): LexicalHeading {
  return {
    children: [makeTextNode(text)],
    direction: 'ltr',
    format: '',
    indent: 0,
    type: 'heading',
    tag,
    version: 1,
  }
}

function makeList(items: string[], listType: 'bullet' | 'number' = 'bullet'): LexicalList {
  return {
    children: items.map(
      (item, index): LexicalListItem => ({
        children: [makeTextNode(item)],
        direction: 'ltr',
        format: '',
        indent: 0,
        type: 'listitem',
        value: index + 1,
        version: 1,
      }),
    ),
    direction: 'ltr',
    format: '',
    indent: 0,
    type: 'list',
    listType,
    tag: listType === 'bullet' ? 'ul' : 'ol',
    version: 1,
  }
}

/**
 * Convert plain text to a Lexical root node.
 * Each non-empty line becomes a paragraph.
 */
export function textToLexical(text: string): LexicalRoot {
  const lines = text.split('\n')
  const children = lines.map((line) => makeParagraph(line))

  return {
    root: {
      children,
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  }
}

/**
 * Convert structured content to a Lexical root node.
 * Sections may have an optional heading, paragraphs, and bullet points.
 */
export function contentToLexical(content: {
  sections: Array<{
    heading?: string
    paragraphs: string[]
    bulletPoints?: string[]
  }>
}): LexicalRoot {
  const children: Array<LexicalParagraph | LexicalHeading | LexicalList> = []

  for (const section of content.sections) {
    if (section.heading) {
      children.push(makeHeading(section.heading, 'h2'))
    }

    for (const paragraph of section.paragraphs) {
      children.push(makeParagraph(paragraph))
    }

    if (section.bulletPoints && section.bulletPoints.length > 0) {
      children.push(makeList(section.bulletPoints, 'bullet'))
    }
  }

  return {
    root: {
      children,
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  }
}
