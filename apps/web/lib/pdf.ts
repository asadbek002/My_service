'use client';

/**
 * Real PDF files built in the browser (jsPDF + autotable), loaded only when a report is exported.
 * DejaVu Sans covers Latin and Cyrillic, since customer names are often written in Cyrillic.
 */
export type PdfTable = { head: string[]; rows: string[][]; foot?: string[]; right?: number[] };
export type PdfSection = { title: string; summary?: [string, string][]; table?: PdfTable; note?: string };
export type PdfReport = { fileName: string; title: string; subtitle?: string; service?: string; sections: PdfSection[] };

const INK: [number, number, number] = [17, 17, 19];
const MUTE: [number, number, number] = [107, 107, 103];
const LINE: [number, number, number] = [230, 230, 227];

let fonts: Promise<[string, string]> | null = null;
async function fontData(): Promise<[string, string]> {
  const load = async (url: string) => {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  };
  fonts ??= Promise.all([load('/fonts/DejaVuSans.ttf'), load('/fonts/DejaVuSans-Bold.ttf')]).catch(e => { fonts = null; throw e; });
  return fonts;
}

export async function downloadPdf(report: PdfReport) {
  const [{ jsPDF }, { default: autoTable }, [regular, bold]] = await Promise.all([import('jspdf'), import('jspdf-autotable'), fontData()]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.addFileToVFS('DejaVuSans.ttf', regular); doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', bold); doc.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold');
  doc.setFont('DejaVu', 'normal');

  const width = doc.internal.pageSize.getWidth(), margin = 14;
  let y = 16;
  doc.setFontSize(9); doc.setTextColor(...MUTE);
  doc.text((report.service ?? 'MyService').toUpperCase(), margin, y);
  doc.text(new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Tashkent', dateStyle: 'short', timeStyle: 'short' }).format(new Date()), width - margin, y, { align: 'right' });
  y += 8;
  doc.setFont('DejaVu', 'bold'); doc.setFontSize(16); doc.setTextColor(...INK);
  doc.text(report.title, margin, y);
  if (report.subtitle) { y += 6; doc.setFont('DejaVu', 'normal'); doc.setFontSize(10); doc.setTextColor(...MUTE); doc.text(doc.splitTextToSize(report.subtitle, width - 2 * margin), margin, y); }
  y += 8;

  const table = { font: 'DejaVu', fontSize: 9, cellPadding: 2, textColor: INK, lineColor: LINE, lineWidth: 0.2 };
  for (const section of report.sections) {
    if (y > 260) { doc.addPage(); y = 16; }
    doc.setFont('DejaVu', 'bold'); doc.setFontSize(12); doc.setTextColor(...INK);
    doc.text(section.title, margin, y); y += 3;
    if (section.summary?.length) {
      autoTable(doc, {
        startY: y, margin: { left: margin, right: margin }, theme: 'plain', styles: { ...table, fontSize: 10 },
        body: section.summary, columnStyles: { 0: { textColor: MUTE }, 1: { halign: 'right', fontStyle: 'bold' } },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3;
    }
    if (section.table) {
      const t = section.table;
      autoTable(doc, {
        startY: y, margin: { left: margin, right: margin }, theme: 'grid', styles: table,
        head: [t.head], body: t.rows.length ? t.rows : [[{ content: "Ma'lumot yo'q", colSpan: t.head.length, styles: { halign: 'center', textColor: MUTE } }] as never],
        ...(t.foot ? { foot: [t.foot] } : {}),
        headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: 'bold' },
        footStyles: { fillColor: [245, 245, 243], textColor: INK, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [250, 250, 249] },
        // Amounts never break across lines ("350 / 000") in head, body or foot; text columns absorb the width.
        didParseCell: data => { if (t.right?.includes(data.column.index)) Object.assign(data.cell.styles, { halign: 'right', cellWidth: 'wrap' }); },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
    }
    if (section.note) {
      doc.setFont('DejaVu', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTE);
      const lines = doc.splitTextToSize(section.note, width - 2 * margin);
      doc.text(lines, margin, y + 2); y += 4 + lines.length * 3.5;
    }
    y += 6;
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFont('DejaVu', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTE);
    doc.text(`${i} / ${pages}`, width - margin, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
  }

  const blob = doc.output('blob');
  const file = new File([blob], report.fileName, { type: 'application/pdf' });
  // Phones: share straight to Telegram etc.; elsewhere download.
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    try { await navigator.share({ files: [file], title: report.title }); return; } catch { /* cancelled: fall back to download */ }
  }
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: report.fileName }).click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
