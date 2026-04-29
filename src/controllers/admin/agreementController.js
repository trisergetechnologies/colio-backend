import PDFDocument from 'pdfkit';
import User from '../../models/User.js';
import {
  HOST_AGREEMENT_FULL_TEXT,
  HOST_AGREEMENT_VERSION,
} from '../../constants/hostAgreement.js';

function safeFilename(name) {
  return String(name || 'expert')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

/**
 * GET /api/admin/consultants/:consultantId/agreement.pdf
 */
export const downloadConsultantAgreementPdf = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Unauthorized access' });
    }

    const { consultantId } = req.params;
    const consultant = await User.findOne({
      _id: consultantId,
      role: 'consultant',
    });

    if (!consultant) {
      return res.status(404).json({ success: false, message: 'Consultant not found' });
    }

    const agr = consultant.consultantProfile?.agreement;
    if (!agr?.signed) {
      return res.status(400).json({
        success: false,
        message: 'No signed agreement on file for this expert',
      });
    }

    const signedAt = agr.signedAt ? new Date(agr.signedAt) : new Date();
    const ist = signedAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const fileBase = `agreement-${safeFilename(consultant.name)}-${signedAt.toISOString().slice(0, 10)}`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileBase}.pdf"`
    );

    doc.pipe(res);

    doc.fontSize(16).text('Colio', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).text('Host Service Agreement', { align: 'center' });
    doc.fontSize(9).text(`Version ${HOST_AGREEMENT_VERSION}`, { align: 'center' });
    doc.moveDown();

    doc.fontSize(9).text(HOST_AGREEMENT_FULL_TEXT, {
      align: 'left',
      lineGap: 2,
    });

    doc.moveDown(2);
    doc.fontSize(11).text('— Digital signature —', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12).text(agr.signedName || consultant.name);
    doc.fontSize(9);
    doc.text(`Typed full name (signature): ${agr.signedName || ''}`);
    doc.text(`Signed at (IST): ${ist}`);
    doc.text(`Agreement version: ${agr.version || HOST_AGREEMENT_VERSION}`);
    doc.text(`IP address: ${agr.ipAddress || '—'}`);
    doc.text(`Device / User-Agent: ${(agr.userAgent || '').slice(0, 500)}`);
    doc.moveDown();
    doc.text(`Expert email: ${consultant.email || '—'}`);
    doc.text(`Expert phone: ${consultant.phone || '—'}`);

    doc.end();
  } catch (error) {
    console.error('downloadConsultantAgreementPdf error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: 'Failed to generate PDF' });
    }
  }
};
