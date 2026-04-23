const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

exports.handler = async (event) => {

  try {

    // ✅ VALIDAR MÉTODO
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: "Method Not Allowed"
      };
    }

    // ✅ VALIDAR BODY
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No data received" })
      };
    }

    let data;

    try {
      data = JSON.parse(event.body);
    } catch (err) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid JSON" })
      };
    }

    const { empresa, cliente, notas, productos } = data;

    const pdfDoc = await PDFDocument.create();
    const page   = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();

    const fontBold   = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontNormal = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const GRAY     = rgb(0.83, 0.83, 0.83);
    const GRID_CLR = rgb(0.5, 0.5, 0.5);
    const BLACK    = rgb(0, 0, 0);

    const txt = (str, x, y, { font = fontNormal, size = 10 } = {}) => {
      page.drawText(String(str ?? ""), { x, y, size, font, color: BLACK });
    };

    const drawLine = (x1, y1, x2, y2) => {
      page.drawLine({
        start: { x: x1, y: y1 },
        end: { x: x2, y: y2 },
        thickness: 0.5,
        color: GRID_CLR
      });
    };

    const fillRect = (x, y, w, h, color) => {
      page.drawRectangle({ x, y, width: w, height: h, color });
    };

    // 🔥 WRAP TEXTO (MEJORADO)
    const wrapText = (str, font, size, maxW) => {
      if (!str) return [""];

      const words = String(str).split(" ");
      const lines = [];
      let current = "";

      for (const word of words) {
        const test = current ? current + " " + word : word;

        if (font.widthOfTextAtSize(test, size) <= maxW) {
          current = test;
        } else {
          if (current) lines.push(current);
          current = word;
        }
      }

      if (current) lines.push(current);
      return lines;
    };

    // ── CONSTANTES ─────────────────────────────
    const MARGIN_L = 40;
    const MARGIN_R = 40;
    const RIGHT_X  = width / 2 + 20;

    const FONT_SIZE = 9;
    const LINE_H    = 13;
    const PAD_V     = 5;
    const ROW_H     = LINE_H + PAD_V * 2;

    const TABLE_X = MARGIN_L;
    const COLS    = [147, 197, 60, 65, 63];

    const COL_XS = COLS.reduce((acc, w, i) => {
      acc.push(i === 0 ? TABLE_X : acc[i - 1] + COLS[i - 1]);
      return acc;
    }, []);

    const TABLE_W     = COLS.reduce((a, b) => a + b, 0);
    const TABLE_RIGHT = TABLE_X + TABLE_W;

    const calcRowH = (cells) => {
      let maxLines = 1;

      [0, 1].forEach((i) => {
        const lines = wrapText(cells[i], fontNormal, FONT_SIZE, COLS[i] - 6);
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

        const text = String(cell ?? "");
        const isRight = !isHeader && i >= 2;

        if (isRight) {
          const tw = font.widthOfTextAtSize(text, FONT_SIZE);
          const x  = COL_XS[i] + (COLS[i] - tw) / 2;
          const y  = botY + (rowH - LINE_H) / 2;
          txt(text, x, y, { font, size: FONT_SIZE });

        } else {
          const lines = wrapText(text, font, FONT_SIZE, COLS[i] - 6);
          let y = topY - PAD_V - LINE_H;

          lines.forEach(line => {
            txt(line, COL_XS[i] + 3, y, { font, size: FONT_SIZE });
            y -= LINE_H;
          });
        }
      });

      drawLine(TABLE_X, topY, TABLE_RIGHT, topY);
      drawLine(TABLE_X, botY, TABLE_RIGHT, botY);
      COL_XS.forEach(x => drawLine(x, botY, x, topY));
      drawLine(TABLE_RIGHT, botY, TABLE_RIGHT, topY);

      return rowH;
    };

    // ── INICIO DIBUJO ─────────────────────────
    let y = height - 50;

    const fecha = new Date().toLocaleDateString();

    // HEADER
    txt(empresa || "Company Name", MARGIN_L, y, { font: fontBold, size: 16 });

    ["432-232-4434", "email@email.com", "Address"]
      .forEach((t, i) => {
        const wtxt = fontNormal.widthOfTextAtSize(t, 9);
        txt(t, width - MARGIN_R - wtxt, y - i * 14);
      });

    y -= 52;
    drawLine(MARGIN_L, y, width - MARGIN_R, y);
    y -= 20;

    // CLIENTE
    txt("Quote Subject", MARGIN_L, y, { font: fontBold });
    txt("Quote", RIGHT_X, y, { font: fontBold });
    y -= 18;

    txt(cliente || "", MARGIN_L, y);
    y -= 18;

    txt("Quote Sent", RIGHT_X, y, { font: fontBold });
    y -= 18;

    txt(fecha, RIGHT_X, y);
    y -= 30;

    // TABLA
    const HEADERS = ["Service/Product", "Description", "Qty", "Unit Cost", "Total"];

    y -= drawRow(HEADERS, y, true);

    const items = Array.isArray(productos) ? productos : [];

    items.forEach(p => {
      const cells = [
        p.servicio || "",
        p.desc || "",
        p.qty || 0,
        `$${Number(p.precio || 0).toFixed(2)}`,
        `$${Number(p.total || 0).toFixed(2)}`
      ];

      y -= drawRow(cells, y);
    });

    y -= 20;

    // TOTALS
    const subtotal = items.reduce((s, p) => s + (Number(p.total) || 0), 0);
    const rough    = subtotal * 0.60;
    const final_   = subtotal * 0.40;

    txt(`Total: $${subtotal.toFixed(2)}`, TABLE_RIGHT - 200, y);
    y -= 15;
    txt(`Rough: $${rough.toFixed(2)}`, TABLE_RIGHT - 200, y);
    y -= 15;
    txt(`Final: $${final_.toFixed(2)}`, TABLE_RIGHT - 200, y);

    y -= 30;

    // NOTES
    txt("Notes", MARGIN_L, y, { font: fontBold });
    y -= 15;

    wrapText(notas, fontNormal, 10, width - MARGIN_L - MARGIN_R)
      .forEach(line => {
        txt(line, MARGIN_L, y);
        y -= 14;
      });

    // ✅ GENERAR PDF
    const pdfBytes = await pdfDoc.save();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf"
      },
      body: Buffer.from(pdfBytes).toString("base64"),
      isBase64Encoded: true
    };

  } catch (error) {

    console.error("ERROR PDF:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message
      })
    };
  }
};
