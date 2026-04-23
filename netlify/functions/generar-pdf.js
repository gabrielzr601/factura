const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { empresa, cliente, notas, productos } = JSON.parse(event.body);

  const pdfDoc = await PDFDocument.create();
  const page   = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();

  const fontBold   = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontNormal = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const GRAY     = rgb(0.83, 0.83, 0.83);
  const GRID_CLR = rgb(0.5,  0.5,  0.5);
  const BLACK    = rgb(0, 0, 0);

  const txt = (str, x, y, { font = fontNormal, size = 10, color = BLACK } = {}) =>
    page.drawText(String(str ?? ""), { x, y, size, font, color });

  const drawLine = (x1, y1, x2, y2) =>
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.5, color: GRID_CLR });

  const fillRect = (x, y, w, h, color) =>
    page.drawRectangle({ x, y, width: w, height: h, color });

  // Word-wrap: salto de línea por palabras, y por caracteres si una palabra no cabe
  const wrapText = (str, font, size, maxW) => {
    const words = String(str ?? "").split(" ");
    const lines = [];
    let current = "";

    for (const word of words) {
      const test = current ? `${current} ${word}` : word;

      if (font.widthOfTextAtSize(test, size) <= maxW) {
        // Cabe en la línea actual
        current = test;
      } else {
        // No cabe — guardar línea actual y empezar nueva
        if (current) lines.push(current);

        // Si la palabra sola tampoco cabe, cortarla carácter a carácter
        if (font.widthOfTextAtSize(word, size) > maxW) {
          let chunk = "";
          for (const char of word) {
            const testChunk = chunk + char;
            if (font.widthOfTextAtSize(testChunk, size) > maxW) {
              lines.push(chunk);
              chunk = char;
            } else {
              chunk = testChunk;
            }
          }
          current = chunk;
        } else {
          current = word;
        }
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [""];
  };

  // ── Constantes ──────────────────────────────────────────────────
  const MARGIN_L  = 40;
  const MARGIN_R  = 40;
  const RIGHT_X   = width / 2 + 20;
  const FONT_SIZE = 9;
  const LINE_H    = 13;
  const PAD_V     = 5;
  const ROW_H     = LINE_H + PAD_V * 2;

  const TABLE_X = MARGIN_L;
  const COLS    = [147, 197, 60, 65, 63];
  const COL_XS  = COLS.reduce((acc, w, i) => {
    acc.push(i === 0 ? TABLE_X : acc[i - 1] + COLS[i - 1]);
    return acc;
  }, []);
  const TABLE_W     = COLS.reduce((a, b) => a + b, 0);
  const TABLE_RIGHT = TABLE_X + TABLE_W;

  const calcRowH = (cells) => {
    let maxLines = 1;
    [0, 1].forEach((i) => {
      const lines = wrapText(String(cells[i] ?? ""), fontNormal, FONT_SIZE, COLS[i] - 6);
      if (lines.length > maxLines) maxLines = lines.length;
    });
    return Math.max(ROW_H, maxLines * LINE_H + PAD_V * 2);
  };

  const drawRow = (cells, topY, isHeader = false) => {
    const font = isHeader ? fontBold : fontNormal;
    const rowH = isHeader ? ROW_H : calcRowH(cells);
    const botY = topY - rowH;

    if (isHeader) fillRect(TABLE_X, botY, TABLE_W, rowH, GRAY);

    cells.forEach((cell, i) => {
      const cellStr = String(cell ?? "");
      const isRight = !isHeader && i >= 2;

      if (isRight) {
        const tw   = font.widthOfTextAtSize(cellStr, FONT_SIZE);
        const xPos = COL_XS[i] + (COLS[i] - tw) / 2;
        const yPos = botY + (rowH - LINE_H) / 2;
        txt(cellStr, xPos, yPos, { font, size: FONT_SIZE });
      } else {
        const lines = wrapText(cellStr, font, FONT_SIZE, COLS[i] - 6);
        let lineY   = topY - PAD_V - LINE_H;
        lines.forEach((line) => {
          const lw = font.widthOfTextAtSize(line, FONT_SIZE);
          const lx = isHeader ? COL_XS[i] + (COLS[i] - lw) / 2 : COL_XS[i] + 3;
          txt(line, lx, lineY, { font, size: FONT_SIZE });
          lineY -= LINE_H;
        });
      }
    });

    drawLine(TABLE_X,     topY, TABLE_RIGHT, topY);
    drawLine(TABLE_X,     botY, TABLE_RIGHT, botY);
    COL_XS.forEach((cx) => drawLine(cx, botY, cx, topY));
    drawLine(TABLE_RIGHT, botY, TABLE_RIGHT, topY);

    return rowH;
  };

  let y = height - 50;

  const fecha = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "2-digit", day: "2-digit",
  });

  // ═══════════════════════════════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════════════════════════════
  txt(empresa || "Company Name", MARGIN_L, y, { font: fontBold, size: 16 });

  ["432-232-4434", "ottovasquez19@gmail.com", "1720 Triumph Trl, Arlington, TX 76002"]
    .forEach((line_text, i) => {
      const tw = fontNormal.widthOfTextAtSize(line_text, 9);
      txt(line_text, width - MARGIN_R - tw, y - i * 14, { size: 9 });
    });

  y -= 52;
  drawLine(MARGIN_L, y, width - MARGIN_R, y);
  y -= 20;

  // ═══════════════════════════════════════════════════════════════
  // CLIENT INFO
  // ═══════════════════════════════════════════════════════════════
  txt("Quote Subject", MARGIN_L, y, { font: fontBold, size: 11 });
  txt("Quote",         RIGHT_X,  y, { font: fontBold, size: 11 });
  y -= 18;

  txt(cliente || "", MARGIN_L, y, { size: 10 });
  y -= 18;

  txt("Quote Sent", RIGHT_X, y, { font: fontBold, size: 11 });
  y -= 18;

  txt(fecha, RIGHT_X, y, { size: 10 });
  y -= 30;

  // ═══════════════════════════════════════════════════════════════
  // TABLA
  // ═══════════════════════════════════════════════════════════════
  const HEADERS = ["Service/Product", "Description", "Qty", "Unit Cost", "Subtotal"];

  const headerH = drawRow(HEADERS, y, true);
  y -= headerH;

  const items = productos || [];
  items.forEach((p) => {
    const cells = [
      p.servicio,
      p.desc,
      p.qty,
      `$${parseFloat(p.precio).toFixed(2)}`,
      `$${parseFloat(p.total).toFixed(2)}`,
    ];
    y -= drawRow(cells, y);
  });

  y -= 20;

  // ═══════════════════════════════════════════════════════════════
  // TOTALS
  // ═══════════════════════════════════════════════════════════════
  const subtotal = items.reduce((s, p) => s + (parseFloat(p.total) || 0), 0);
  const rough    = subtotal * 0.60;
  const final_   = subtotal * 0.40;

  const TW1      = 150;
  const TW2      = 100;
  const TOTALS_X = TABLE_RIGHT - TW1 - TW2;

  [
    [true,  "Total",          `$${subtotal.toFixed(2)}`],
    [false, "Rough-in (60%)", `$${rough.toFixed(2)}`],
    [false, "Final (40%)",    `$${final_.toFixed(2)}`],
  ].forEach(([isFirst, label, value]) => {
    const topY = y;
    const botY = topY - ROW_H;
    const font = isFirst ? fontBold : fontNormal;

    if (isFirst) fillRect(TOTALS_X, botY, TW1 + TW2, ROW_H, GRAY);

    drawLine(TOTALS_X,             topY, TOTALS_X + TW1 + TW2, topY);
    drawLine(TOTALS_X,             botY, TOTALS_X + TW1 + TW2, botY);
    drawLine(TOTALS_X,             botY, TOTALS_X,              topY);
    drawLine(TOTALS_X + TW1,       botY, TOTALS_X + TW1,        topY);
    drawLine(TOTALS_X + TW1 + TW2, botY, TOTALS_X + TW1 + TW2, topY);

    const textY = botY + (ROW_H - LINE_H) / 2;
    txt(label, TOTALS_X + 4, textY, { font, size: FONT_SIZE });

    const vw = font.widthOfTextAtSize(value, FONT_SIZE);
    const centeredX = TOTALS_X + TW1 + (TW2 - vw) / 2;
    txt(value, centeredX, textY, { font, size: FONT_SIZE });

    y -= ROW_H;
  });

  y -= 20;

  // ═══════════════════════════════════════════════════════════════
  // NOTES
  // ═══════════════════════════════════════════════════════════════
  txt("Notes", MARGIN_L, y, { font: fontBold, size: 11 });
  y -= 18;

  if (notas) {
    wrapText(notas, fontNormal, 10, width - MARGIN_L - MARGIN_R).forEach((line) => {
      txt(line, MARGIN_L, y, { size: 10 });
      y -= 14;
    });
  }

  const pdfBytes = await pdfDoc.save();
  const base64   = Buffer.from(pdfBytes).toString("base64");

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="cotizacion.pdf"`,
    },
    body: base64,
    isBase64Encoded: true,
  };
};
