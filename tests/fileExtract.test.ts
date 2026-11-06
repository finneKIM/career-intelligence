import { describe, expect, it } from 'vitest';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { extractFromFile, MAX_FILE_BYTES, setPdfjsLoader, type PdfjsLike } from '../src/features/documents/fileExtract';

// Node 에서는 pdf.js 의 legacy 빌드를 쓴다(브라우저에서는 일반 빌드 + 워커)
setPdfjsLoader(async () => {
  const mod = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfjsLike;
  mod.GlobalWorkerOptions.workerSrc = pathToFileURL(join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
  return mod;
});

/** 글꼴(Helvetica)만 쓰는 최소 PDF를 직접 만든다(영문 텍스트 전용, 오프셋 계산 포함) */
function makePdf(lines: string[]): Uint8Array {
  const content = `BT /F1 12 Tf 72 720 Td 14 TL ${lines.map((l) => `(${l.replace(/[()\\]/g, '\\$&')}) Tj T*`).join(' ')} ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

describe('파일 글자 추출 (6-A)', () => {
  it('DOCX: 한글 본문·여러 문단·특수문자를 읽어야 합니다', async () => {
    const doc = new Document({
      sections: [{ children: [
        new Paragraph({ children: [new TextRun('김시험 이력서 & 경력 <요약>')] }),
        new Paragraph({ children: [new TextRun('PyTorch 기반 음성 모델 서빙, 지연 90ms 달성'), new TextRun({ text: '\t추가', break: 1 })] }),
      ] }],
    });
    const bytes = new Uint8Array(await Packer.toArrayBuffer(doc));
    const r = await extractFromFile('resume.docx', bytes);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe('docx');
      expect(r.text).toContain('김시험 이력서 & 경력 <요약>');
      expect(r.text).toContain('PyTorch 기반 음성 모델 서빙, 지연 90ms 달성');
      expect(r.text.split('\n').length).toBeGreaterThanOrEqual(2);
    }
  });

  it('PDF: 글자를 추출해야 합니다(영문 시험 파일)', async () => {
    const r = await extractFromFile('cv.pdf', makePdf(['Senior ML Engineer resume', 'Built PyTorch pipelines and Docker services']));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe('pdf');
      expect(r.text).toContain('Senior ML Engineer resume');
      expect(r.text).toContain('PyTorch pipelines');
    }
  });

  it('글자가 없는 PDF(스캔본 가정)는 안내 메시지와 함께 실패해야 합니다', async () => {
    const r = await extractFromFile('scan.pdf', makePdf([' ']));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('스캔본');
  });

  it('손상된 파일·구형 .doc·지원하지 않는 형식·너무 큰 파일은 이유와 함께 거부해야 합니다', async () => {
    const bad = await extractFromFile('x.pdf', new Uint8Array([1, 2, 3, 4]));
    expect(bad.ok).toBe(false);
    const badDocx = await extractFromFile('x.docx', new Uint8Array([1, 2, 3, 4]));
    expect(badDocx.ok).toBe(false);
    const doc = await extractFromFile('old.doc', new Uint8Array(10));
    expect(!doc.ok && doc.reason).toContain('.docx');
    const exe = await extractFromFile('a.exe', new Uint8Array(10));
    expect(!exe.ok && exe.reason).toContain('PDF');
    const big = await extractFromFile('big.pdf', new Uint8Array(MAX_FILE_BYTES + 1));
    expect(!big.ok && big.reason).toContain('너무 큽니다');
  });

  it('텍스트 파일은 그대로 읽고, 너무 짧으면 거부해야 합니다', async () => {
    const ok = await extractFromFile('a.txt', new TextEncoder().encode('프로젝트 경험: 음성 인식 모델을 서빙하고 지연 시간을 줄였습니다.'));
    expect(ok.ok && ok.text).toContain('음성 인식');
    expect((await extractFromFile('a.txt', new TextEncoder().encode('짧음'))).ok).toBe(false);
  });
});
