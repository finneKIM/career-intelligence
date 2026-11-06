/**
 * 문서 내보내기. 이름·연락처 자리표시자는 여기서 처음으로 실제 값으로 합성된다(브라우저 안에서만).
 *  - DOCX: docx 라이브러리 / PPTX: pptxgenjs / PDF: 브라우저 인쇄 창("PDF로 저장") — 한글 글꼴을 시스템 글꼴로 처리해 깨짐을 피한다.
 *  - 구형 .ppt 는 지원하지 않는다(생성 라이브러리 확인 못 함 → PPTX 사용 안내).
 * 무거운 라이브러리는 내보내기를 누를 때만 불러온다(dynamic import).
 */
import type { GeneratedDocument, Profile } from '../../types';
import { compose, contactOf } from './documentService';

const headerLines = (profile: Profile | null): { name: string; contact: string } => {
  const c = contactOf(profile);
  return { name: c.name ?? '', contact: [c.email, c.phone, c.address].filter(Boolean).join(' · ') };
};

export async function buildDocx(doc: GeneratedDocument, profile: Profile | null): Promise<Uint8Array> {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun, AlignmentType } = await import('docx');
  const h = headerLines(profile);
  const font = 'Malgun Gothic';
  const children = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: h.name || doc.title, font })] }),
    ...(h.contact ? [new Paragraph({ children: [new TextRun({ text: h.contact, font, size: 20 })] })] : []),
    ...(h.name ? [new Paragraph({ children: [new TextRun({ text: doc.title, font, color: '666666', size: 20 })] })] : []),
    ...doc.sections.flatMap((s) => [
      new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 80 }, children: [new TextRun({ text: compose(s.heading, profile), font })] }),
      ...s.paragraphs.map(
        (p) =>
          new Paragraph({
            bullet: doc.kind === 'COVER_LETTER' ? undefined : { level: 0 },
            alignment: AlignmentType.LEFT,
            spacing: { after: 80 },
            children: [new TextRun({ text: compose(p.text, profile), font })],
          }),
      ),
    ]),
  ];
  return new Uint8Array(await Packer.toArrayBuffer(new Document({ sections: [{ children }] })));
}

export async function buildPptx(doc: GeneratedDocument, profile: Profile | null): Promise<Uint8Array> {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  const h = headerLines(profile);
  const font = 'Malgun Gothic';
  const title = pptx.addSlide();
  title.addText(doc.title, { x: 0.7, y: 2.2, w: 11.9, h: 1.2, fontFace: font, fontSize: 34, bold: true, color: '1F2937' });
  if (h.name) title.addText([h.name, h.contact].filter(Boolean).join('  |  '), { x: 0.7, y: 3.5, w: 11.9, h: 0.6, fontFace: font, fontSize: 16, color: '6B7280' });
  for (const s of doc.sections) {
    const slide = pptx.addSlide();
    slide.addText(compose(s.heading, profile), { x: 0.6, y: 0.4, w: 12, h: 0.9, fontFace: font, fontSize: 28, bold: true, color: '4338CA' });
    slide.addText(
      s.paragraphs.map((p) => ({ text: compose(p.text, profile), options: { bullet: true, breakLine: true } })),
      { x: 0.8, y: 1.5, w: 11.6, h: 5.2, fontFace: font, fontSize: 18, color: '111827', valign: 'top', paraSpaceAfter: 8 },
    );
  }
  return (await pptx.write({ outputType: 'uint8array' })) as Uint8Array;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** 인쇄용 HTML(이름·연락처 합성 포함) */
export function buildPrintHtml(doc: GeneratedDocument, profile: Profile | null): string {
  const h = headerLines(profile);
  const body = doc.sections
    .map(
      (s) =>
        `<h2>${esc(compose(s.heading, profile))}</h2>` +
        (doc.kind === 'COVER_LETTER'
          ? s.paragraphs.map((p) => `<p>${esc(compose(p.text, profile))}</p>`).join('')
          : `<ul>${s.paragraphs.map((p) => `<li>${esc(compose(p.text, profile))}</li>`).join('')}</ul>`),
    )
    .join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>
body{font-family:'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif;margin:32px;color:#111;line-height:1.6;font-size:12pt}
h1{font-size:22pt;margin:0 0 4px}h2{font-size:14pt;border-bottom:1px solid #ccc;padding-bottom:4px;margin-top:22px;color:#312e81}
.c{color:#555;font-size:10pt}ul{padding-left:20px}li{margin:3px 0}p{margin:6px 0}
${doc.kind === 'PORTFOLIO' ? 'h2{page-break-before:always;font-size:20pt}h2:first-of-type{page-break-before:avoid}' : ''}
</style></head><body><h1>${esc(h.name || doc.title)}</h1>${h.contact ? `<div class="c">${esc(h.contact)}</div>` : ''}${h.name ? `<div class="c">${esc(doc.title)}</div>` : ''}${body}</body></html>`;
}

export function downloadBytes(bytes: Uint8Array, filename: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 인쇄 창을 열어 사용자가 "PDF로 저장"을 고르게 한다 */
export function printAsPdf(doc: GeneratedDocument, profile: Profile | null): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(buildPrintHtml(doc, profile));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
  return true;
}

export const safeFilename = (doc: GeneratedDocument, ext: string) => `${doc.title.replace(/[\\/:*?"<>|]/g, '_')}.${ext}`;
