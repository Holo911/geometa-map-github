import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: true });

/** Render user Markdown to sanitized HTML. Links open in a new tab. */
export function renderMarkdown(md: string): string {
  const raw = marked.parse(md ?? '', { async: false }) as string;
  const clean = DOMPurify.sanitize(raw, { ADD_ATTR: ['target', 'rel'] });
  return clean;
}
