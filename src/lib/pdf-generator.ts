/**
 * Lightweight, zero-dependency standard PDF 1.4 generator.
 * Converts text/resumes into valid, compliant PDF binary buffers that render
 * natively in Gmail, Adobe Acrobat, Apple Preview, and Google Chrome.
 */

export interface PdfDocumentOptions {
  title?: string;
  author?: string;
  fontSize?: number;
  lineHeight?: number;
}

/**
 * Escapes characters for PDF string literals: (, ), and \
 */
function escapePdfText(text: string): string {
  // Normalize Unicode characters to clean ASCII representations for Standard 14 PDF fonts
  const clean = text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "--")
    .replace(/[\u2022\u25CF]/g, "*")
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7E\t\n\r]/g, " ");

  return clean
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

/**
 * Splits lines and wraps long words so text fits within standard A4 margins.
 */
function wrapText(text: string, maxCharsPerLine = 85): string[] {
  const result: string[] = [];
  const rawLines = text.split(/\r?\n/);

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      result.push("");
      continue;
    }

    const words = trimmed.split(/\s+/);
    let currentLine = "";

    for (const word of words) {
      if ((currentLine + (currentLine ? " " : "") + word).length <= maxCharsPerLine) {
        currentLine += (currentLine ? " " : "") + word;
      } else {
        if (currentLine) result.push(currentLine);
        // If single word is longer than maxCharsPerLine, break it
        if (word.length > maxCharsPerLine) {
          let remainder = word;
          while (remainder.length > maxCharsPerLine) {
            result.push(remainder.slice(0, maxCharsPerLine));
            remainder = remainder.slice(maxCharsPerLine);
          }
          currentLine = remainder;
        } else {
          currentLine = word;
        }
      }
    }
    if (currentLine) {
      result.push(currentLine);
    }
  }

  return result;
}

/**
 * Generates a valid multi-page standard PDF 1.4 buffer from plain text.
 */
export function generatePdfFromText(
  title: string,
  rawContent: string,
  options: PdfDocumentOptions = {}
): Buffer {
  const linesPerPage = 48;
  const wrappedLines = wrapText(rawContent, 85);
  const cleanTitle = title.replace(/[-_]/g, " ").trim() || "Candidate Resume";

  // Chunk lines into pages
  const pages: string[][] = [];
  let currentChunk: string[] = [];

  for (const line of wrappedLines) {
    currentChunk.push(line);
    if (currentChunk.length >= linesPerPage) {
      pages.push(currentChunk);
      currentChunk = [];
    }
  }
  if (currentChunk.length > 0 || pages.length === 0) {
    pages.push(currentChunk);
  }

  const pageCount = pages.length;

  // Object indices:
  // 1: Catalog
  // 2: Pages container
  // 3: Font /Helvetica-Bold
  // 4: Font /Helvetica
  // For each page i (0-based):
  //   pageObjIndex = 5 + i * 2
  //   contentObjIndex = 5 + i * 2 + 1
  const objects: { id: number; body: string }[] = [];

  // Font definitions
  objects.push({
    id: 3,
    body: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`,
  });
  objects.push({
    id: 4,
    body: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
  });

  const pageObjIds: number[] = [];

  for (let i = 0; i < pageCount; i++) {
    const pageId = 5 + i * 2;
    const contentId = pageId + 1;
    pageObjIds.push(pageId);

    const pageLines = pages[i];
    const streamCommands: string[] = [];

    // Header on Page 1
    let startY = 780;
    if (i === 0) {
      streamCommands.push(
        `BT /F1 16 Tf 50 ${startY} Td (${escapePdfText(cleanTitle)}) Tj ET`
      );
      // Header horizontal separator line
      streamCommands.push(`0.5 w 50 ${startY - 10} m 545 ${startY - 10} l S`);
      startY -= 32;
    }

    // Body text
    streamCommands.push(`BT /F2 10 Tf 50 ${startY} Td 13.5 TL`);
    for (let j = 0; j < pageLines.length; j++) {
      const line = pageLines[j];
      if (j === 0) {
        streamCommands.push(`(${escapePdfText(line)}) Tj`);
      } else {
        streamCommands.push(`T* (${escapePdfText(line)}) Tj`);
      }
    }
    streamCommands.push(`ET`);

    // Footer with page numbering
    const footerText = `Page ${i + 1} of ${pageCount}`;
    streamCommands.push(
      `BT /F2 8 Tf 500 35 Td (${escapePdfText(footerText)}) Tj ET`
    );

    const streamBody = streamCommands.join("\n");
    const streamLength = Buffer.byteLength(streamBody, "latin1");

    objects.push({
      id: pageId,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,
    });

    objects.push({
      id: contentId,
      body: `<< /Length ${streamLength} >>\nstream\n${streamBody}\nendstream`,
    });
  }

  // Catalog and Pages
  const kidsStr = pageObjIds.map((id) => `${id} 0 R`).join(" ");
  objects.unshift({
    id: 2,
    body: `<< /Type /Pages /Kids [${kidsStr}] /Count ${pageCount} >>`,
  });
  objects.unshift({
    id: 1,
    body: `<< /Type /Catalog /Pages 2 0 R >>`,
  });

  // Sort objects by ID
  objects.sort((a, b) => a.id - b.id);

  // Assemble PDF binary with accurate byte offsets for xref
  const parts: Buffer[] = [];
  const header = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  parts.push(Buffer.from(header, "latin1"));

  const offsets: number[] = [];
  offsets[0] = 0; // Object 0 is always dummy free

  let currentOffset = parts[0].length;

  for (const obj of objects) {
    offsets[obj.id] = currentOffset;
    const objStr = `${obj.id} 0 obj\n${obj.body}\nendobj\n`;
    const objBuf = Buffer.from(objStr, "latin1");
    parts.push(objBuf);
    currentOffset += objBuf.length;
  }

  const startXref = currentOffset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;

  for (let id = 1; id <= objects.length; id++) {
    const off = offsets[id] || 0;
    const pad = off.toString().padStart(10, "0");
    xref += `${pad} 00000 n \n`;
  }

  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;
  parts.push(Buffer.from(xref + trailer, "latin1"));

  return Buffer.concat(parts);
}
