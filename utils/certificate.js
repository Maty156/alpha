const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const QRCode = require('qrcode');

const CRIMSON = '#B3122F';
const CRIMSON_BRIGHT = '#E8483F';
const INK = '#1A1814';
const MUTED = '#6b6558';

function certificateId(userId, completedAt) {
  const hash = crypto
    .createHash('sha256')
    .update(`${userId}-${completedAt}-alpha-cyber`)
    .digest('hex')
    .slice(0, 8)
    .toUpperCase();
  return `ALPHA-${String(userId).padStart(4, '0')}-${hash}`;
}

// Simple vector wolf mark, same geometry as the site logo, scaled to fit a box.
function drawWolfMark(doc, x, y, size) {
  const s = size / 150; // original art was designed on a ~150-unit grid
  doc.save();
  doc.translate(x, y).scale(s);
  doc.lineWidth(6).strokeColor(CRIMSON);

  const path = (pts, close = true) => {
    doc.moveTo(pts[0][0], pts[0][1]);
    pts.slice(1).forEach(p => doc.lineTo(p[0], p[1]));
    if (close) doc.closePath();
    doc.stroke();
  };

  path([[10, 30], [-15, -35], [45, 5]]);
  path([[110, 30], [135, -35], [75, 5]]);
  path([[10, 30], [45, 5], [75, 5], [110, 30], [120, 90], [95, 130], [60, 150], [25, 130], [0, 90]]);
  doc.restore();
}

function drawHexGrid(doc, x, y, w, h, color, opacity) {
  const size = 20;
  const hexW = size * 1.8;
  const hexH = size * 1.55;
  doc.save();
  doc.opacity(opacity);
  doc.lineWidth(0.6).strokeColor(color);
  for (let row = -1; row * hexH * 0.75 < h + hexH; row++) {
    const rowY = y + row * hexH * 0.75;
    const offset = row % 2 === 0 ? 0 : hexW / 2;
    for (let col = -1; col * hexW + offset < w + hexW; col++) {
      const cx = x + col * hexW + offset;
      const cy = rowY;
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        pts.push([cx + (hexW / 2) * Math.cos(angle), cy + (hexH / 2) * Math.sin(angle)]);
      }
      doc.moveTo(pts[0][0], pts[0][1]);
      pts.slice(1).forEach(p => doc.lineTo(p[0], p[1]));
      doc.closePath().stroke();
    }
  }
  doc.opacity(1);
  doc.restore();
}

function drawDotBurst(doc, cx, cy, color) {
  doc.save();
  const rings = 7;
  for (let r = 0; r < rings; r++) {
    for (let a = 0; a < 5; a++) {
      const dist = 14 + r * 13;
      const angle = -Math.PI / 2 + (a - 2) * 0.22 - r * 0.02;
      const px = cx + dist * Math.cos(angle);
      const py = cy + dist * Math.sin(angle);
      const opacity = Math.max(0, 0.55 - r * 0.07);
      if (opacity <= 0) continue;
      doc.opacity(opacity).fillColor(color).circle(px, py, 2.2).fill();
    }
  }
  doc.opacity(1);
  doc.restore();
}

function drawSeal(doc, cx, cy) {
  doc.save();
  // outer + inner ring
  doc.lineWidth(1.4).strokeColor(CRIMSON).circle(cx, cy, 34).stroke();
  doc.lineWidth(0.6).strokeColor(CRIMSON).circle(cx, cy, 29).stroke();
  // wolf mark, scaled small, centered in the seal
  drawWolfMark(doc, cx - 13, cy - 10, 26);
  doc.restore();

  // ribbon banner underneath
  const bw = 96, bh = 16;
  doc.save();
  doc.fillColor(CRIMSON);
  doc.moveTo(cx - bw / 2, cy + 30)
    .lineTo(cx + bw / 2, cy + 30)
    .lineTo(cx + bw / 2 - 6, cy + 30 + bh)
    .lineTo(cx - bw / 2 + 6, cy + 30 + bh)
    .closePath().fill();
  doc.fillColor('#FDF6F4').font('Helvetica-Bold').fontSize(8)
    .text('VERIFIED', cx - bw / 2, cy + 34, { width: bw, align: 'center', characterSpacing: 1.5 });
  doc.restore();
}

/**
 * Streams a completed-assessment certificate PDF to `res`.
 * `client` = { companyName, completedAt } — completedAt as an ISO-ish string.
 */
async function generateCertificate(res, client) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="alpha-certificate-${client.userId}.pdf"`);
  doc.pipe(res);

  const W = doc.page.width;
  const H = doc.page.height;
  const margin = 40;

  // background: soft crimson wash, deeper at the edges
  const grad = doc.linearGradient(0, 0, W, H);
  grad.stop(0, '#FDF1EF').stop(0.5, '#FBE9E6').stop(1, '#F7DDD9');
  doc.rect(0, 0, W, H).fill(grad);

  drawHexGrid(doc, margin + 8, margin + 8, W - (margin + 8) * 2, H - (margin + 8) * 2, CRIMSON, 0.05);

  // outer + inner border frame
  doc.lineWidth(2).strokeColor(CRIMSON)
    .rect(margin, margin, W - margin * 2, H - margin * 2).stroke();
  doc.lineWidth(0.75).strokeColor(CRIMSON)
    .rect(margin + 8, margin + 8, W - (margin + 8) * 2, H - (margin + 8) * 2).stroke();

  // corner ticks
  const cornerLen = 22;
  [[margin, margin], [W - margin, margin], [margin, H - margin], [W - margin, H - margin]].forEach(([cx, cy], i) => {
    doc.lineWidth(2).strokeColor(CRIMSON_BRIGHT);
    const dx = i % 2 === 0 ? 1 : -1;
    const dy = i < 2 ? 1 : -1;
    doc.moveTo(cx, cy).lineTo(cx + dx * cornerLen, cy).stroke();
    doc.moveTo(cx, cy).lineTo(cx, cy + dy * cornerLen).stroke();
  });

  drawWolfMark(doc, W / 2 - 20, margin + 30, 40);

  doc.font('Helvetica-Bold').fontSize(11).fillColor(CRIMSON)
    .text('ALPHA CYBERSECURITY', 0, margin + 82, { align: 'center', characterSpacing: 3 });

  doc.font('Helvetica-Bold').fontSize(26).fillColor(INK)
    .text('CERTIFICATE OF SECURITY ASSESSMENT', 0, margin + 118, { align: 'center', characterSpacing: 1 });

  doc.font('Helvetica').fontSize(12).fillColor(MUTED)
    .text('This certifies that', 0, margin + 168, { align: 'center' });

  doc.font('Helvetica-Bold').fontSize(30).fillColor(CRIMSON)
    .text(client.companyName, 0, margin + 190, { align: 'center' });

  doc.font('Helvetica').fontSize(12).fillColor(MUTED)
    .text(
      'has completed an authorized Active Directory security assessment performed by Alpha Cybersecurity,',
      margin + 80, margin + 240, { align: 'center', width: W - (margin + 80) * 2 }
    )
    .text(
      'covering domain enumeration, privilege escalation analysis, and attack-path validation within an agreed scope.',
      { align: 'center', width: W - (margin + 80) * 2 }
    );

  const dateStr = new Date(client.completedAt).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  doc.font('Helvetica').fontSize(11).fillColor(INK)
    .text(`Date completed: ${dateStr}`, 0, margin + 300, { align: 'center' });

  // signature lines
  const sigY = H - margin - 70;
  const sig1X = margin + 90;
  const sig2X = W - margin - 90 - 180;

  [
    { x: sig1X, name: 'Matyas Abreham', title: 'AD / Red Team Lead' },
    { x: sig2X, name: 'Natnael Wase', title: 'Detection & Reporting Lead' },
  ].forEach(sig => {
    doc.lineWidth(0.75).strokeColor(INK).moveTo(sig.x, sigY).lineTo(sig.x + 180, sigY).stroke();
    doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(sig.name, sig.x, sigY + 8, { width: 180, align: 'center' });
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(sig.title, sig.x, sigY + 22, { width: 180, align: 'center' });
  });

  drawSeal(doc, W / 2, sigY - 46);

  // verification code + real scannable QR (with its own white backing so it
  // stays scannable over the textured background)
  const certId = client.certificateId || certificateId(client.userId, client.completedAt);
  const verifyUrl = client.verifyUrl || `https://alpha-cybersecurity.example/verify.html?code=${certId}`;

  const qrSize = 64;
  const qrX = W - margin - 26 - qrSize;
  const qrY = H - margin - 26 - qrSize;

  doc.roundedRect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 12, 4).fill('#FFFFFF');
  doc.lineWidth(0.75).strokeColor(CRIMSON).roundedRect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 12, 4).stroke();

  try {
    const qrBuffer = await QRCode.toBuffer(verifyUrl, {
      type: 'png', margin: 0, width: qrSize * 4,
      color: { dark: '#8A0F26', light: '#FFFFFF' },
    });
    doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
  } catch {
    // if QR generation fails for any reason, the certificate still renders fine without it
  }

  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
    .text(`Verification code: ${certId}`, margin + 8, H - margin - 34, { width: W - (margin + 8) * 2, align: 'center' });

  doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
    .text(
      'Academic prototype — Alpha Cybersecurity is a student graduation project, not a commercial security firm.',
      margin + 8, H - margin - 20, { width: W - (margin + 8) * 2, align: 'center' }
    );

  doc.end();
}

module.exports = { generateCertificate, certificateId };
