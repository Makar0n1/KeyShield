/**
 * Email Service for KeyShield
 *
 * Sends transaction receipts via email using self-hosted Mailcow server.
 * Includes PDF attachment matching admin export style.
 */

const nodemailer = require('nodemailer');
const pdfReceiptService = require('./pdfReceiptService');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
  }

  /**
   * Initialize email transporter
   */
  init() {
    if (this.initialized) return;

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
    console.log('📧 Email service initialized');
  }

  /**
   * Check if email service is available
   */
  isEnabled() {
    return this.initialized && this.transporter !== null;
  }

  /**
   * Send transaction receipt with PDF attachment
   * @param {string} to - Recipient email
   * @param {Object} deal - Deal object
   * @param {Object} transaction - Transaction details
   * @param {Object} user - User object (optional, for PDF generation)
   * @returns {Promise<boolean>}
   */
  async sendReceipt(to, deal, transaction, user = null) {
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
        subject = `KeyShield - Чек возврата по сделке ${deal.dealId}`;
      } else if (isPurchase) {
        subject = `KeyShield - Чек о покупке по сделке ${deal.dealId}`;
      } else {
        subject = `KeyShield - Чек по сделке ${deal.dealId}`;
      }

      const html = this.generateReceiptHTML(deal, transaction);
      const text = this.generateReceiptText(deal, transaction);

      // Generate PDF attachment
      let attachments = [];
      try {
        const pdfBuffer = await pdfReceiptService.generateReceipt(deal, transaction, user);
        const pdfFilename = pdfReceiptService.generateFilename(deal, user, transaction);
        attachments = [{
          filename: pdfFilename,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }];
      } catch (pdfError) {
        console.error('📧 Error generating PDF, sending without attachment:', pdfError.message);
      }

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
  generateReceiptHTML(deal, transaction) {
    const { type, amount, txHash, toAddress } = transaction;
    const isRefund = type === 'refund';
    const isPurchase = type === 'purchase';
    const date = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });

    // Generate statement number
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const statementNumber = `${dateStr}-${random}`;

    // Determine status text and colors (matching admin PDF)
    let typeText, statusText, amountLabel, statusColor;
    if (isRefund) {
      typeText = 'ЧЕК ВОЗВРАТА';
      statusText = 'Возврат выполнен';
      amountLabel = 'Сумма возврата';
      statusColor = '#f59e0b';
    } else if (isPurchase) {
      typeText = 'ЧЕК О ПОКУПКЕ';
      statusText = 'Покупка завершена';
      amountLabel = 'Сумма покупки';
      statusColor = '#3b82f6';
    } else {
      typeText = 'ЧЕК О ВЫПЛАТЕ';
      statusText = 'Выплата получена';
      amountLabel = 'Сумма выплаты';
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
      <p style="margin: 8px 0 0; color: #64748b; font-size: 14px;">Безопасные сделки с криптовалютой</p>
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
        <p style="margin: 0; color: #475569; font-size: 12px; font-weight: 600;">ИНФОРМАЦИЯ О СДЕЛКЕ</p>
      </div>
      <div style="border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 6px 6px; padding: 15px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">ID сделки</td>
            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; text-align: right; font-weight: 500;">${deal.dealId}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-size: 13px; border-top: 1px solid #f1f5f9;">Товар/услуга</td>
            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; text-align: right; border-top: 1px solid #f1f5f9;">${deal.productName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-size: 13px; border-top: 1px solid #f1f5f9;">Сумма сделки</td>
            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; text-align: right; border-top: 1px solid #f1f5f9;">${deal.amount.toFixed(2)} ${deal.asset}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-size: 13px; border-top: 1px solid #f1f5f9;">Комиссия сервиса</td>
            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; text-align: right; border-top: 1px solid #f1f5f9;">${deal.commission.toFixed(2)} ${deal.asset}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Transaction section -->
    <div style="margin: 0 30px 20px;">
      <div style="background: #f1f5f9; padding: 10px 15px; border-radius: 6px 6px 0 0;">
        <p style="margin: 0; color: #475569; font-size: 12px; font-weight: 600;">ТРАНЗАКЦИЯ</p>
      </div>
      <div style="border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 6px 6px; padding: 15px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Адрес получателя</td>
            <td style="padding: 8px 0; color: #1e293b; font-size: 11px; text-align: right; word-break: break-all;">${toAddress}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-size: 13px; border-top: 1px solid #f1f5f9;">Дата</td>
            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; text-align: right; border-top: 1px solid #f1f5f9;">${date}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- TX Link -->
    <div style="margin: 0 30px 25px; text-align: center;">
      <a href="https://tronscan.org/#/transaction/${txHash}" style="display: inline-block; padding: 12px 24px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; color: #6366f1; text-decoration: none; font-size: 13px;">
        🔗 Проверить транзакцию на TronScan
      </a>
    </div>

    <!-- PDF notice -->
    <div style="margin: 0 30px 20px; padding: 15px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; text-align: center;">
      <p style="margin: 0; color: #1e40af; font-size: 13px;">📎 PDF-выписка прикреплена к этому письму</p>
    </div>

    <!-- Footer -->
    <div style="background: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
      <p style="margin: 0 0 8px; color: #64748b; font-size: 12px;">Документ сформирован автоматически системой KeyShield</p>
      <p style="margin: 0 0 8px; color: #64748b; font-size: 12px;">
        Вопросы: <a href="mailto:support@keyshield.me" style="color: #6366f1; text-decoration: none;">support@keyshield.me</a>
      </p>
      <p style="margin: 0; color: #94a3b8; font-size: 11px;">© ${new Date().getFullYear()} KeyShield. Все права защищены.</p>
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
  generateReceiptText(deal, transaction) {
    const { type, amount, txHash, toAddress } = transaction;
    const isRefund = type === 'refund';
    const isPurchase = type === 'purchase';
    const date = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });

    let title, statusText, amountLabel;
    if (isRefund) {
      title = 'Чек возврата';
      statusText = 'Возврат выполнен';
      amountLabel = 'Сумма возврата';
    } else if (isPurchase) {
      title = 'Чек о покупке';
      statusText = 'Покупка завершена';
      amountLabel = 'Сумма покупки';
    } else {
      title = 'Чек по сделке';
      statusText = 'Сделка завершена';
      amountLabel = 'Сумма выплаты';
    }

    return `
KeyShield - ${title}

${statusText}

${amountLabel}: ${amount.toFixed(2)} ${deal.asset}

Детали:
- ID сделки: ${deal.dealId}
- Товар/услуга: ${deal.productName}
- Комиссия сервиса: ${deal.commission.toFixed(2)} ${deal.asset}
- Адрес получателя: ${toAddress}
- Дата: ${date}

Транзакция: https://tronscan.org/#/transaction/${txHash}

---
KeyShield - Безопасные сделки с криптовалютой
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
