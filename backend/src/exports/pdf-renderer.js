import { AppError } from '../errors.js';

const LETTER_WIDTH = 612;
const LETTER_HEIGHT = 792;
const LINES_PER_PAGE = 62;
const MAX_LINE_LENGTH = 110;

function failed(code = 'EXPORT_RENDER_FAILED') {
  return new AppError(500, code, 'Export rendering could not be completed.');
}
function printable(value) {
  if (typeof value !== 'string') throw failed('EXPORT_RENDER_INVALID');
  return value.normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/[^\x20-\x7e]/g, '?').trim();
}
function wrap(text) {
  const value = printable(text);
  if (!value) return [''];
  const words = value.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (word.length > MAX_LINE_LENGTH) {
      if (line) { lines.push(line); line = ''; }
      for (let index = 0; index < word.length; index += MAX_LINE_LENGTH) lines.push(word.slice(index, index + MAX_LINE_LENGTH));
    } else if (!line || line.length + word.length + 1 <= MAX_LINE_LENGTH) line = line ? `${line} ${word}` : word;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}
function escapePdf(value) { return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
function pageContent(lines) {
  const operations = ['BT', '/F1 9 Tf', '45 748 Td', '11 TL'];
  for (const line of lines) operations.push(`(${escapePdf(line)}) Tj`, 'T*');
  operations.push('ET');
  return operations.join('\n');
}
function pdf(objects) {
  let output = '%PDF-1.4\n%PDF-safe\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets[index + 1] = Buffer.byteLength(output, 'binary');
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const start = Buffer.byteLength(output, 'binary');
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) output += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(output, 'binary');
}

/** A deliberately small, dependency-free server-side renderer. It writes only
 * static PDF text streams with built-in Helvetica: no browser, network assets,
 * JavaScript, attachments, external fonts, or request-supplied markup. */
export class PdfRenderer {
  constructor({ maxPages = 100, maxResults = 100 } = {}) {
    if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 500 || !Number.isSafeInteger(maxResults) || maxResults < 1 || maxResults > 500) {
      throw new TypeError('PdfRenderer needs bounded page and result limits.');
    }
    this.maxPages = maxPages;
    this.maxResults = maxResults;
  }

  renderDocumentLines({ exportId, generatedAt, documentModel }) {
    if (!documentModel || typeof documentModel !== 'object' || !Array.isArray(documentModel.sections)) throw failed('EXPORT_RENDER_INVALID');
    const timestamp = generatedAt instanceof Date ? generatedAt.toISOString() : printable(String(generatedAt));
    const lines = [
      printable(documentModel.title), `Export ID: ${printable(exportId)}`, `Generated at (UTC): ${timestamp}`,
      `Source attribution: ${printable(documentModel.sourceAttribution)}`, '',
    ];
    let resultSections = 0;
    for (const section of documentModel.sections) {
      if (!section || typeof section.heading !== 'string' || !Array.isArray(section.lines)) throw failed('EXPORT_RENDER_INVALID');
      if (/^Result \d+$/.test(section.heading)) {
        resultSections += 1;
        if (resultSections > this.maxResults) throw failed('EXPORT_RENDER_LIMIT_EXCEEDED');
      }
      lines.push(...wrap(section.heading.toUpperCase()));
      for (const line of section.lines) lines.push(...wrap(String(line)));
      lines.push('');
    }
    lines.push(...wrap(documentModel.disclaimer));
    return lines;
  }

  async render({ exportId, generatedAt, documentModel }) {
    const lines = this.renderDocumentLines({ exportId, generatedAt, documentModel });
    const pages = [];
    for (let index = 0; index < lines.length; index += LINES_PER_PAGE - 2) pages.push(lines.slice(index, index + LINES_PER_PAGE - 2));
    if (!pages.length || pages.length > this.maxPages) throw failed('EXPORT_RENDER_LIMIT_EXCEEDED');
    pages.forEach((linesForPage, index) => linesForPage.push('', `Page ${index + 1} of ${pages.length}`));
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    const pageObjectIds = [];
    for (const page of pages) {
      const content = pageContent(page);
      const contentId = objects.length + 1;
      objects.push(`<< /Length ${Buffer.byteLength(content, 'binary')} >>\nstream\n${content}\nendstream`);
      const pageId = objects.length + 1;
      pageObjectIds.push(pageId);
      objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LETTER_WIDTH} ${LETTER_HEIGHT}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
    }
    objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
    return { body: pdf(objects), pageCount: pages.length, contentType: 'application/pdf' };
  }
}
