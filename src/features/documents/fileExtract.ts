/**
 * 파일에서 글자만 뽑는다(브라우저 안에서 처리, 원본 파일은 저장하지 않음). 6-A.
 *  - PDF: pdf.js 로 글자 추출. 스캔본(이미지) PDF는 글자가 없어 안내 메시지를 돌려준다.
 *  - Word(.docx): 압축 파일 안의 word/document.xml 에서 본문 글자를 읽는다. 구형 .doc 는 지원하지 않는다.
 *  - 텍스트(.txt, .md): 그대로 읽는다.
 */
import JSZip from 'jszip';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_EXTRACTED_CHARS = 60_000;

export type ExtractResult = { ok: true; text: string; truncated: boolean; kind: 'pdf' | 'docx' | 'txt' } | { ok: false; reason: string };

/** pdf.js 모듈 중 우리가 쓰는 부분만 (시험에서 Node 용 빌드로 바꿔 끼울 수 있게 함) */
export interface PdfjsLike {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: { data: Uint8Array; isEvalSupported?: boolean; useSystemFonts?: boolean }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{ getTextContent(): Promise<{ items: { str?: string; hasEOL?: boolean }[] }> }>;
    }>;
    destroy(): Promise<void>;
  };
}

let defaultLoader: () => Promise<PdfjsLike> = async () => {
  const mod = (await import('pdfjs-dist')) as unknown as PdfjsLike;
  if (!mod.GlobalWorkerOptions.workerSrc) mod.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  return mod;
};
/** 시험용: pdf.js 로더 교체 */
export const setPdfjsLoader = (l: () => Promise<PdfjsLike>) => {
  defaultLoader = l;
};

const decodeXml = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');

export async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const f = zip.file('word/document.xml');
  if (!f) throw new Error('Word 문서(.docx) 형식이 아닙니다.');
  const xml = await f.async('string');
  const paragraphs = xml.split('</w:p>').map((p) => {
    const parts: string[] = [];
    const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(p))) parts.push(m[1] !== undefined ? decodeXml(m[1]) : m[0].startsWith('<w:tab') ? '\t' : '\n');
    return parts.join('');
  });
  return paragraphs.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export async function extractPdfText(bytes: Uint8Array, loader: () => Promise<PdfjsLike> = defaultLoader): Promise<string> {
  const pdfjs = await loader();
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true });
  try {
    const doc = await task.promise;
    const out: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      out.push(content.items.map((it) => (it.str ?? '') + (it.hasEOL ? '\n' : '')).join(''));
    }
    return out.join('\n\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  } finally {
    await task.destroy();
  }
}

export async function extractFromFile(name: string, bytes: Uint8Array): Promise<ExtractResult> {
  if (bytes.byteLength > MAX_FILE_BYTES) return { ok: false, reason: `파일이 너무 큽니다(최대 ${MAX_FILE_BYTES / 1024 / 1024}MB).` };
  const lower = name.toLowerCase();
  let kind: 'pdf' | 'docx' | 'txt';
  if (lower.endsWith('.pdf')) kind = 'pdf';
  else if (lower.endsWith('.docx')) kind = 'docx';
  else if (lower.endsWith('.txt') || lower.endsWith('.md')) kind = 'txt';
  else if (lower.endsWith('.doc')) return { ok: false, reason: '구형 Word(.doc)는 지원하지 않습니다. Word에서 .docx로 저장하거나 내용을 복사해 붙여 넣어 주세요.' };
  else return { ok: false, reason: 'PDF, Word(.docx), 텍스트(.txt) 파일만 읽을 수 있습니다.' };

  let text: string;
  try {
    text = kind === 'pdf' ? await extractPdfText(bytes) : kind === 'docx' ? await extractDocxText(bytes) : new TextDecoder('utf-8').decode(bytes);
  } catch (e) {
    const m = e instanceof Error ? e.message : '';
    if (/password/i.test(m)) return { ok: false, reason: '암호가 걸린 PDF는 읽을 수 없습니다. 암호를 풀어 다시 올리거나 내용을 붙여 넣어 주세요.' };
    return { ok: false, reason: kind === 'docx' ? '이 파일을 Word(.docx)로 읽지 못했습니다. 파일이 손상되었거나 형식이 다릅니다.' : '이 파일을 읽지 못했습니다. 파일이 손상되었을 수 있습니다. 내용을 복사해 붙여 넣어 주세요.' };
  }
  if (text.replace(/\s/g, '').length < 20) {
    return {
      ok: false,
      reason: kind === 'pdf' ? '글자를 찾지 못했습니다. 스캔본(이미지) PDF일 수 있습니다 — 이 앱은 이미지 속 글자를 읽지 못하니 내용을 복사해 붙여 넣어 주세요.' : '파일에서 읽을 수 있는 글자가 거의 없습니다.',
    };
  }
  const truncated = text.length > MAX_EXTRACTED_CHARS;
  return { ok: true, text: truncated ? text.slice(0, MAX_EXTRACTED_CHARS) : text, truncated, kind };
}
