/** A small HTML tree for the limited timetable markup, usable in Workers and browsers. */
export interface HtmlElement {
  tag: string;
  attributes: string;
  children: Array<HtmlElement | string>;
}

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'wbr']);
const RAW_TEXT_TAGS = new Set(['script', 'style']);

export function parseHtmlStructure(html: string): HtmlElement {
  if (html.length > 3_000_000) throw new Error('Відповідь ЛНУ завелика для обробки');
  const root: HtmlElement = { tag: '#document', attributes: '', children: [] };
  const stack = [root];
  let cursor = 0;
  while (cursor < html.length) {
    const opening = html.indexOf('<', cursor);
    if (opening < 0) {
      stack[stack.length - 1]!.children.push(html.slice(cursor));
      break;
    }
    if (opening > cursor) stack[stack.length - 1]!.children.push(html.slice(cursor, opening));
    if (html.startsWith('<!--', opening)) {
      const end = html.indexOf('-->', opening + 4);
      cursor = end < 0 ? html.length : end + 3;
      continue;
    }
    let end = opening + 1;
    let quote = '';
    for (; end < html.length; end += 1) {
      const char = html[end]!;
      if (quote) {
        if (char === quote) quote = '';
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '>') {
        break;
      }
    }
    if (end >= html.length) break;
    const raw = html.slice(opening + 1, end).trim();
    cursor = end + 1;
    if (!raw || raw.startsWith('!') || raw.startsWith('?')) continue;
    const match = raw.match(/^\/?\s*([a-z][\w:-]*)/i);
    if (!match) continue;
    const tag = match[1]!.toLowerCase();
    if (raw.startsWith('/')) {
      let index = -1;
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i]!.tag === tag) { index = i; break; }
      }
      if (index > 0) stack.length = index;
      continue;
    }
    const isSelfClosing = raw.endsWith('/');
    const attrSource = isSelfClosing ? raw.slice(0, -1).trimEnd() : raw;
    // HTML permits omitted closing tags for cells and rows.
    if (tag === 'tr' || tag === 'td' || tag === 'th') {
      const autoClose = tag === 'tr' ? ['tr', 'td', 'th'] : ['td', 'th'];
      let boundary = 0;
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i]!.tag === (tag === 'tr' ? 'table' : 'tr')) { boundary = i; break; }
      }
      let index = -1;
      for (let i = stack.length - 1; i > boundary; i -= 1) {
        if (autoClose.includes(stack[i]!.tag)) { index = i; break; }
      }
      if (index > 0) stack.length = index;
    }
    const node: HtmlElement = {
      tag,
      attributes: attrSource.slice(match[0].length),
      children: [],
    };
    stack[stack.length - 1]!.children.push(node);
    if (RAW_TEXT_TAGS.has(tag)) {
      if (!isSelfClosing) {
        const closeRe = new RegExp(`</${tag}\\b[^>]*>`, 'i');
        const rest = html.slice(cursor);
        const closeMatch = closeRe.exec(rest);
        if (closeMatch) {
          if (closeMatch.index > 0) node.children.push(rest.slice(0, closeMatch.index));
          cursor += closeMatch.index + closeMatch[0].length;
        } else {
          if (rest.length > 0) node.children.push(rest);
          cursor = html.length;
        }
      }
      continue;
    }
    if (!VOID_TAGS.has(tag) && !isSelfClosing) {
      if (stack.length > 128) throw new Error('Надмірна вкладеність HTML у відповіді ЛНУ');
      stack.push(node);
    }
  }
  return root;
}

export function walkElements(node: HtmlElement, visit: (element: HtmlElement) => void): void {
  for (const child of node.children) {
    if (typeof child !== 'string') {
      visit(child);
      walkElements(child, visit);
    }
  }
}

function collectText(node: HtmlElement): string {
  if (RAW_TEXT_TAGS.has(node.tag)) return '';
  if (node.tag === 'br' || node.tag === 'hr') return ' ';
  let out = '';
  for (const child of node.children) {
    out += typeof child === 'string' ? child : collectText(child);
  }
  return out;
}

export function elementText(node: HtmlElement): string {
  return collectText(node).replace(/\s+/g, ' ').trim();
}

export function hasClass(node: HtmlElement, className: string): boolean {
  const match = node.attributes.match(/(?:^|\s)class\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').split(/\s+/).includes(className);
}
