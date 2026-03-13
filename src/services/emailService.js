/**
 * Email Service for KeyShield
 *
 * Sends transaction receipts via email using self-hosted Mailcow server.
 * Includes PDF attachment matching admin export style (same format as /api/admin/export/deal/:dealId).
 */

const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { t, getLocale } = require('../locales');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
    this.fontPath = path.join(__dirname, '../../client/public/fonts/Roboto.ttf');
  }

  /**
   * Initialize email transporter
   */
  init() {
    if (this.initialized) return;

    // Debug: log all email env vars
    console.log('📧 Email service init - checking env vars:');
    console.log(`   EMAIL_HOST: ${process.env.EMAIL_HOST || 'NOT SET'}`);
    console.log(`   EMAIL_PORT: ${process.env.EMAIL_PORT || 'NOT SET'}`);
    console.log(`   EMAIL_SECURE: ${process.env.EMAIL_SECURE || 'NOT SET'}`);
    console.log(`   EMAIL_USER: ${process.env.EMAIL_USER || 'NOT SET'}`);
    console.log(`   EMAIL_PASS: ${process.env.EMAIL_PASS || 'NOT SET'}`);
    console.log(`   EMAIL_FROM: ${process.env.EMAIL_FROM || 'NOT SET'}`);

    // Check if email is configured
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log('📧 Email service not configured (EMAIL_HOST, EMAIL_USER, EMAIL_PASS required)');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    this.initialized = true;
    console.log('📧 Email service initialized successfully!');
  }

  /**
   * Check if email service is available
   */
  isEnabled() {
    return this.initialized && this.transporter !== null;
  }

  /**
   * Generate deterministic statement number based on deal data
   * Same deal + same user = same statement number always
   */
  generateStatementNumber(deal, telegramId) {
    // Use deal completion date for the date part
    const completedAt = deal.completedAt ? new Date(deal.completedAt) : new Date(deal.createdAt);
    const dateStr = completedAt.toISOString().slice(0, 10).replace(/-/g, '');

    // Generate deterministic hash from dealId + telegramId
    const hashInput = `${deal.dealId}-${telegramId}`;
    const hash = crypto.createHash('md5').update(hashInput).digest('hex');
    const shortHash = hash.substring(0, 6).toUpperCase();

    return `${dateStr}-${shortHash}`;
  }

  /**
   * Generate PDF receipt (same format as admin export)
   * @param {Object} deal - Deal object
   * @param {Object} user - User object with telegramId and username
   * @returns {Promise<{buffer: Buffer, filename: string}>}
   */
  async generatePdfReceipt(deal, user, lang = 'ru') {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const safeUsername = (user?.username || String(user?.telegramId)).replace(/[^a-zA-Z0-9_]/g, '');
          const statementNumber = this.generateStatementNumber(deal, user?.telegramId);
          const filename = `KeyShield_Receipt_${deal.dealId}_${safeUsername}_${statementNumber}.pdf`;
          resolve({ buffer, filename, statementNumber });
        });
        doc.on('error', reject);

        // Try to load custom font
        try {
          if (fs.existsSync(this.fontPath)) {
            doc.registerFont('Roboto', this.fontPath);
            doc.font('Roboto');
          }
        } catch (e) {
          // Use default font
        }

        const telegramId = user?.telegramId;
        const statementNumber = this.generateStatementNumber(deal, telegramId);
        const completedAt = deal.completedAt ? new Date(deal.completedAt) : new Date(deal.createdAt);
        const locale = getLocale(lang);
        const tzLabel = t(lang, 'pdf.timezone');
        const receiptDate = completedAt.toLocaleString(locale, { timeZone: 'Europe/Moscow' }) + ` ${tzLabel}`;

        const statusNames = {
          completed: t(lang, 'pdf.status_completed'),
          resolved: t(lang, 'pdf.status_resolved'),
          expired: t(lang, 'pdf.status_expired'),
          cancelled: t(lang, 'pdf.status_cancelled'),
          refunded: t(lang, 'pdf.status_refunded'),
        };
        const statusColors = {
          completed: '#10b981',
          resolved: '#f59e0b',
          expired: '#ef4444',
          cancelled: '#64748b',
          refunded: '#f59e0b'
        };

        // ===== TITLE PAGE =====
        doc.rect(0, 0, 595, 8).fill('#6366f1');

        doc.moveDown(4);
        doc.fontSize(42).fillColor('#6366f1').text('KeyShield', { align: 'center' });
        doc.fontSize(14).fillColor('#64748b').text(t(lang, 'pdf.subtitle'), { align: 'center' });

        doc.moveDown(4);

        doc.rect(150, doc.y, 295, 80).fillAndStroke('#f8fafc', '#e2e8f0');
        doc.moveDown(0.5);
        doc.fontSize(12).fillColor('#64748b').text(t(lang, 'pdf.statement'), { align: 'center' });
        doc.fontSize(28).fillColor('#1e293b').text(`№${statementNumber}`, { align: 'center' });

        doc.moveDown(4);

        doc.fontSize(11).fillColor('#64748b').text(t(lang, 'pdf.doc_type'), { align: 'center' });
        doc.fontSize(14).fillColor('#1e293b').text(t(lang, 'pdf.deal_statement'), { align: 'center' });

        doc.moveDown(1);
        doc.fontSize(11).fillColor('#64748b').text(t(lang, 'pdf.deal_label'), { align: 'center' });
        doc.fontSize(14).fillColor('#6366f1').text(deal.dealId, { align: 'center' });

        doc.moveDown(1);
        doc.fontSize(11).fillColor('#64748b').text(t(lang, 'pdf.prepared_for'), { align: 'center' });
        doc.fontSize(14).fillColor('#1e293b').text(`@${user?.username || t(lang, 'pdf.na')} (ID: ${telegramId})`, { align: 'center' });

        doc.moveDown(1);
        doc.fontSize(11).fillColor('#64748b').text(t(lang, 'pdf.date_generated'), { align: 'center' });
        doc.fontSize(12).fillColor('#1e293b').text(receiptDate, { align: 'center' });

        doc.fontSize(9).fillColor('#94a3b8').text('https://keyshield.me', 50, 750, { align: 'center', link: 'https://keyshield.me' });
        doc.rect(0, 834, 595, 8).fill('#6366f1');

        // ===== DEAL PAGE =====
        doc.addPage();

        doc.rect(0, 0, 595, 40).fill('#6366f1');
        doc.fontSize(14).fillColor('#ffffff').text(`${t(lang, 'pdf.statement')} №${statementNumber}`, 50, 12);
        doc.fontSize(10).fillColor('#c7d2fe').text(deal.dealId, 450, 14);

        doc.moveDown(3);

        doc.fontSize(18).fillColor('#1e293b').text(deal.productName, 50, 60);
        doc.fontSize(10).fillColor(statusColors[deal.status] || '#64748b').text(statusNames[deal.status] || deal.status, 50, 82);

        const drawSection = (title, yPos) => {
          doc.rect(50, yPos, 495, 24).fill('#f1f5f9');
          doc.fontSize(11).fillColor('#475569').text(title, 60, yPos + 6);
          return yPos + 30;
        };

        const na = t(lang, 'pdf.na');
        const drawRow = (label, value, y) => {
          doc.fontSize(10).fillColor('#64748b').text(label, 60, y);
          doc.fontSize(10).fillColor('#1e293b').text(String(value || na), 200, y);
          return y + 18;
        };

        let y = 110;

        // Basic Info
        y = drawSection(t(lang, 'pdf.section_basic'), y);
        y = drawRow(t(lang, 'pdf.field_deal_id'), deal.dealId, y);
        const desc = deal.description || '';
        y = drawRow(t(lang, 'pdf.field_description'), desc.substring(0, 60) + (desc.length > 60 ? '...' : ''), y);
        y += 10;

        // Participants
        y = drawSection(t(lang, 'pdf.section_participants'), y);
        const userRole = deal.buyerId === telegramId ? t(lang, 'pdf.role_buyer') : t(lang, 'pdf.role_seller');
        y = drawRow(t(lang, 'pdf.field_role'), userRole, y);
        y = drawRow(t(lang, 'pdf.field_initiator'), deal.creatorRole === 'buyer' ? t(lang, 'pdf.role_buyer') : t(lang, 'pdf.role_seller'), y);
        y += 10;

        // Financial
        y = drawSection(t(lang, 'pdf.section_financial'), y);
        y = drawRow(t(lang, 'pdf.field_amount'), `${deal.amount} ${deal.asset}`, y);
        y = drawRow(t(lang, 'pdf.field_commission'), `${deal.commission} ${deal.asset}`, y);
        const commTypes = { buyer: t(lang, 'pdf.role_buyer'), seller: t(lang, 'pdf.role_seller'), split: t(lang, 'pdf.comm_split') };
        y = drawRow(t(lang, 'pdf.field_comm_payer'), commTypes[deal.commissionType], y);

        let depositAmt = deal.amount;
        if (deal.commissionType === 'buyer') depositAmt += deal.commission;
        else if (deal.commissionType === 'split') depositAmt += deal.commission / 2;
        y = drawRow(t(lang, 'pdf.field_deposit_amount'), `${depositAmt.toFixed(2)} ${deal.asset}`, y);

        let sellerAmt = deal.amount;
        if (deal.commissionType === 'seller') sellerAmt -= deal.commission;
        else if (deal.commissionType === 'split') sellerAmt -= deal.commission / 2;
        y = drawRow(t(lang, 'pdf.field_seller_payout'), `${sellerAmt.toFixed(2)} ${deal.asset}`, y);
        y += 10;

        // Wallets
        y = drawSection(t(lang, 'pdf.section_wallets'), y);
        y = drawRow(t(lang, 'pdf.field_multisig'), deal.multisigAddress || na, y);
        y = drawRow(t(lang, 'pdf.field_buyer_wallet'), deal.buyerAddress || na, y);
        y = drawRow(t(lang, 'pdf.field_seller_wallet'), deal.sellerAddress || na, y);
        y += 10;

        // Blockchain
        if (deal.depositTxHash || deal.payoutTxHash) {
          y = drawSection(t(lang, 'pdf.section_blockchain'), y);
          if (deal.depositTxHash) {
            y = drawRow(t(lang, 'pdf.field_deposit_tx'), deal.depositTxHash.substring(0, 40) + '...', y);
          }
          if (deal.payoutTxHash) {
            y = drawRow(t(lang, 'pdf.field_payout_tx'), deal.payoutTxHash.substring(0, 40) + '...', y);
          }
          y += 10;
        }

        // Timeline
        y = drawSection(t(lang, 'pdf.section_timeline'), y);
        const createdDate = new Date(deal.createdAt).toLocaleString(locale, { timeZone: 'Europe/Moscow' });
        y = drawRow(t(lang, 'pdf.field_created'), createdDate + ` ${tzLabel}`, y);
        if (deal.completedAt) {
          const completedDate = new Date(deal.completedAt).toLocaleString(locale, { timeZone: 'Europe/Moscow' });
          y = drawRow(t(lang, 'pdf.field_completed'), completedDate + ` ${tzLabel}`, y);
        }

        // Footer
        const footerY = 780;
        if (y < footerY) {
          doc.fontSize(9).fillColor('#94a3b8').text(
            t(lang, 'pdf.footer_auto'),
            50, footerY, { align: 'center', width: 495 }
          );
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Send transaction receipt with PDF attachment
   * @param {string} to - Recipient email
   * @param {Object} deal - Deal object
   * @param {Object} transaction - Transaction details (for HTML email, not PDF)
   * @param {Object} user - User object (required for PDF generation)
   * @returns {Promise<boolean>}
   */
  async sendReceipt(to, deal, transaction, user = null, lang = 'ru') {
    if (!this.isEnabled()) {
      console.log('📧 Email service not enabled, skipping receipt');
      return false;
    }

    try {
      const { type } = transaction;
      const isRefund = type === 'refund';
      const isPurchase = type === 'purchase';

      let subject;
      if (isRefund) {
        subject = t(lang, 'pdf.subject_refund', { dealId: deal.dealId });
      } else if (isPurchase) {
        subject = t(lang, 'pdf.subject_purchase', { dealId: deal.dealId });
      } else {
        subject = t(lang, 'pdf.subject_deal', { dealId: deal.dealId });
      }

      // Generate PDF attachment (same format as admin export)
      let attachments = [];
      let statementNumber = null;
      if (user) {
        try {
          const pdfResult = await this.generatePdfReceipt(deal, user, lang);
          attachments = [{
            filename: pdfResult.filename,
            content: pdfResult.buffer,
            contentType: 'application/pdf'
          }];
          statementNumber = pdfResult.statementNumber;
        } catch (pdfError) {
          console.error('📧 Error generating PDF, sending without attachment:', pdfError.message);
        }
      }

      const html = this.generateReceiptHTML(deal, transaction, statementNumber, lang);
      const text = this.generateReceiptText(deal, transaction, lang);

      await this.transporter.sendMail({
        from: `"KeyShield" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
        to,
        subject,
        text,
        html,
        attachments
      });

      console.log(`📧 Receipt sent to ${to} for deal ${deal.dealId} (with PDF: ${attachments.length > 0})`);
      return true;
    } catch (error) {
      console.error('📧 Error sending receipt:', error.message);
      return false;
    }
  }

  /**
   * Generate HTML receipt (matching admin PDF style)
   */
  generateReceiptHTML(deal, transaction, statementNumber = null, lang = 'ru') {
    const { type, amount, txHash, toAddress } = transaction;
    const isRefund = type === 'refund';
    const isPurchase = type === 'purchase';

    // Use deal completion date
    const completedAt = deal.completedAt ? new Date(deal.completedAt) : new Date(deal.createdAt);
    const locale = getLocale(lang);
    const date = completedAt.toLocaleString(locale, { timeZone: 'Europe/Moscow' });

    // Use provided statementNumber or generate one
    if (!statementNumber) {
      const dateStr = completedAt.toISOString().slice(0, 10).replace(/-/g, '');
      const random = Math.random().toString(36).substring(2, 8).toUpperCase();
      statementNumber = `${dateStr}-${random}`;
    }

    // Determine status text and colors
    let typeText, statusText, amountLabel, statusColor;
    if (isRefund) {
      typeText = t(lang, 'pdf.email_type_refund');
      statusText = t(lang, 'pdf.email_status_refund');
      amountLabel = t(lang, 'pdf.email_amount_refund');
      statusColor = '#f59e0b';
    } else if (isPurchase) {
      typeText = t(lang, 'pdf.email_type_purchase');
      statusText = t(lang, 'pdf.email_status_purchase');
      amountLabel = t(lang, 'pdf.email_amount_purchase');
      statusColor = '#3b82f6';
    } else {
      typeText = t(lang, 'pdf.email_type_payout');
      statusText = t(lang, 'pdf.email_status_payout');
      amountLabel = t(lang, 'pdf.email_amount_payout');
      statusColor = '#10b981';
    }

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">

    <!-- Top accent bar -->
    <div style="height: 6px; background: #6366f1;"></div>

    <!-- Header -->
    <div style="padding: 30px; text-align: center;">
      <h1 style="margin: 0; font-size: 32px; color: #6366f1; font-weight: 600;">KeyShield</h1>
      <p style="margin: 8px 0 0; color: #64748b; font-size: 14px;">${t(lang, 'pdf.email_subtitle')}</p>
    </div>

    <!-- Statement box -->
    <div style="margin: 0 30px 20px; padding: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; text-align: center;">
      <p style="margin: 0 0 5px; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">${typeText}</p>
      <p style="margin: 0; color: #1e293b; font-size: 20px; font-weight: 600;">№${statementNumber}</p>
    </div>

    <!-- Status -->
    <div style="text-align: center; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 22px; font-weight: 600; color: ${statusColor};">${statusText}</p>
    </div>

    <!-- Amount box -->
    <div style="margin: 0 30px 25px; padding: 20px; background: ${statusColor}; border-radius: 8px; text-align: center;">
      <p style="margin: 0 0 5px; color: rgba(255,255,255,0.9); font-size: 13px;">${amountLabel}</p>
      <p style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">${amount.toFixed(2)} ${deal.asset}</p>
    </div>

    <!-- Deal info section -->
    <div style="margin: 0 30px 20px;">
      <div style="background: #f1f5f9; padding: 10px 15px; border-radius: 6px 6px 0 0;">
        <p style="margin: 0; color: #475569; font-size: 12px; font-weight: 600;">${t(lang, 'pdf.email_section_deal')}</p>
      </div>
      <div style="border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 6px 6px; padding: 15px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">${t(lang, 'pdf.email_field_deal_id')}</td>
            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; text-align: right; font-weight: 500;">${deal.dealId}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-size: 13px; border-top: 1px solid #f1f5f9;">${t(lang, 'pdf.email_field_product')}</td>
            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; text-align: right; border-top: 1px solid #f1f5f9;">${deal.productName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-size: 13px; border-top: 1px solid #f1f5f9;">${t(lang, 'pdf.email_field_amount')}</td>
            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; text-align: right; border-top: 1px solid #f1f5f9;">${deal.amount.toFixed(2)} ${deal.asset}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-size: 13px; border-top: 1px solid #f1f5f9;">${t(lang, 'pdf.email_field_commission')}</td>
            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; text-align: right; border-top: 1px solid #f1f5f9;">${deal.commission.toFixed(2)} ${deal.asset}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Transaction section -->
    <div style="margin: 0 30px 20px;">
      <div style="background: #f1f5f9; padding: 10px 15px; border-radius: 6px 6px 0 0;">
        <p style="margin: 0; color: #475569; font-size: 12px; font-weight: 600;">${t(lang, 'pdf.email_section_tx')}</p>
      </div>
      <div style="border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 6px 6px; padding: 15px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">${t(lang, 'pdf.email_field_recipient')}</td>
            <td style="padding: 8px 0; color: #1e293b; font-size: 11px; text-align: right; word-break: break-all;">${toAddress}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-size: 13px; border-top: 1px solid #f1f5f9;">${t(lang, 'pdf.email_field_date')}</td>
            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; text-align: right; border-top: 1px solid #f1f5f9;">${date}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- TX Link -->
    <div style="margin: 0 30px 25px; text-align: center;">
      <a href="https://tronscan.org/#/transaction/${txHash}" style="display: inline-block; padding: 12px 24px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; color: #6366f1; text-decoration: none; font-size: 13px;">
        ${t(lang, 'pdf.email_tronscan_link')}
      </a>
    </div>

    <!-- PDF notice -->
    <div style="margin: 0 30px 20px; padding: 15px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; text-align: center;">
      <p style="margin: 0; color: #1e40af; font-size: 13px;">${t(lang, 'pdf.email_pdf_notice')}</p>
    </div>

    <!-- Footer -->
    <div style="background: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
      <p style="margin: 0 0 8px; color: #64748b; font-size: 12px;">${t(lang, 'pdf.email_footer_auto')}</p>
      <p style="margin: 0 0 8px; color: #64748b; font-size: 12px;">
        ${t(lang, 'pdf.email_footer_support')} <a href="mailto:support@keyshield.me" style="color: #6366f1; text-decoration: none;">support@keyshield.me</a>
      </p>
      <p style="margin: 0; color: #94a3b8; font-size: 11px;">${new Date().getFullYear()} KeyShield. ${t(lang, 'pdf.email_rights')}</p>
    </div>

    <!-- Bottom accent bar -->
    <div style="height: 6px; background: #6366f1;"></div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Generate plain text receipt (fallback)
   */
  generateReceiptText(deal, transaction, lang = 'ru') {
    const { type, amount, txHash, toAddress } = transaction;
    const isRefund = type === 'refund';
    const isPurchase = type === 'purchase';

    const completedAt = deal.completedAt ? new Date(deal.completedAt) : new Date(deal.createdAt);
    const locale = getLocale(lang);
    const date = completedAt.toLocaleString(locale, { timeZone: 'Europe/Moscow' });

    let title, statusText, amountLabel;
    if (isRefund) {
      title = t(lang, 'pdf.text_title_refund');
      statusText = t(lang, 'pdf.text_status_refund');
      amountLabel = t(lang, 'pdf.text_amount_refund');
    } else if (isPurchase) {
      title = t(lang, 'pdf.text_title_purchase');
      statusText = t(lang, 'pdf.text_status_purchase');
      amountLabel = t(lang, 'pdf.text_amount_purchase');
    } else {
      title = t(lang, 'pdf.text_title_deal');
      statusText = t(lang, 'pdf.text_status_deal');
      amountLabel = t(lang, 'pdf.text_amount_payout');
    }

    return `
KeyShield - ${title}

${statusText}

${amountLabel}: ${amount.toFixed(2)} ${deal.asset}

${t(lang, 'pdf.text_details')}
- ${t(lang, 'pdf.text_field_deal_id')}: ${deal.dealId}
- ${t(lang, 'pdf.text_field_product')}: ${deal.productName}
- ${t(lang, 'pdf.text_field_commission')}: ${deal.commission.toFixed(2)} ${deal.asset}
- ${t(lang, 'pdf.text_field_recipient')}: ${toAddress}
- ${t(lang, 'pdf.text_field_date')}: ${date}

Tx: https://tronscan.org/#/transaction/${txHash}

---
${t(lang, 'pdf.text_footer')}
support@keyshield.me
    `.trim();
  }

  /**
   * Validate email format
   */
  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

// Singleton instance
const emailService = new EmailService();

module.exports = emailService;
