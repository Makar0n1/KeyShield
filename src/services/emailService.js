/**
 * Email Service for KeyShield
 *
 * Sends transaction receipts via email using self-hosted Mailcow server.
 */

const nodemailer = require('nodemailer');

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
   * Send transaction receipt
   * @param {string} to - Recipient email
   * @param {Object} deal - Deal object
   * @param {Object} transaction - Transaction details
   * @returns {Promise<boolean>}
   */
  async sendReceipt(to, deal, transaction) {
    if (!this.isEnabled()) {
      console.log('📧 Email service not enabled, skipping receipt');
      return false;
    }

    try {
      const { type, amount, txHash, toAddress } = transaction;
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

      await this.transporter.sendMail({
        from: `"KeyShield" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
        to,
        subject,
        text,
        html
      });

      console.log(`📧 Receipt sent to ${to} for deal ${deal.dealId}`);
      return true;
    } catch (error) {
      console.error('📧 Error sending receipt:', error.message);
      return false;
    }
  }

  /**
   * Generate HTML receipt
   */
  generateReceiptHTML(deal, transaction) {
    const { type, amount, txHash, toAddress } = transaction;
    const isRefund = type === 'refund';
    const isPurchase = type === 'purchase';
    const date = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });

    // Determine status text and colors
    let statusIcon, statusText, amountLabel, statusColor;
    if (isRefund) {
      statusIcon = '↩️';
      statusText = 'Возврат выполнен';
      amountLabel = 'Сумма возврата';
      statusColor = '#f39c12';
    } else if (isPurchase) {
      statusIcon = '🛒';
      statusText = 'Покупка завершена';
      amountLabel = 'Сумма покупки';
      statusColor = '#3498db';
    } else {
      statusIcon = '✅';
      statusText = 'Сделка завершена';
      amountLabel = 'Сумма выплаты';
      statusColor = '#27ae60';
    }

    const gradientEnd = isPurchase ? '#2980b9' : (isRefund ? '#f1c40f' : '#2ecc71');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background-color: #f5f5f5;
      margin: 0;
      padding: 20px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #ffffff;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .header .subtitle {
      color: #a0a0a0;
      margin-top: 8px;
      font-size: 14px;
    }
    .content {
      padding: 30px;
    }
    .status {
      text-align: center;
      margin-bottom: 30px;
    }
    .status-icon {
      font-size: 48px;
      margin-bottom: 10px;
    }
    .status-text {
      font-size: 20px;
      font-weight: 600;
      color: ${statusColor};
    }
    .details {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid #e9ecef;
    }
    .detail-row:last-child {
      border-bottom: none;
    }
    .detail-label {
      color: #6c757d;
      font-size: 14px;
    }
    .detail-value {
      font-weight: 500;
      color: #212529;
      font-size: 14px;
      text-align: right;
      word-break: break-all;
    }
    .amount-row {
      background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%);
      color: white;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      margin-bottom: 20px;
    }
    .amount-label {
      font-size: 14px;
      opacity: 0.9;
    }
    .amount-value {
      font-size: 32px;
      font-weight: 700;
      margin-top: 5px;
    }
    .tx-link {
      display: block;
      text-align: center;
      background: #f8f9fa;
      border-radius: 8px;
      padding: 15px;
      color: #0066cc;
      text-decoration: none;
      font-size: 14px;
      margin-bottom: 20px;
    }
    .tx-link:hover {
      background: #e9ecef;
    }
    .footer {
      background: #f8f9fa;
      padding: 20px 30px;
      text-align: center;
      color: #6c757d;
      font-size: 12px;
    }
    .footer a {
      color: #0066cc;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>KeyShield</h1>
      <div class="subtitle">Безопасные сделки с криптовалютой</div>
    </div>

    <div class="content">
      <div class="status">
        <div class="status-icon">${statusIcon}</div>
        <div class="status-text">${statusText}</div>
      </div>

      <div class="amount-row" style="background: linear-gradient(135deg, ${statusColor} 0%, ${gradientEnd} 100%);">
        <div class="amount-label">${amountLabel}</div>
        <div class="amount-value">${amount.toFixed(2)} ${deal.asset}</div>
      </div>

      <div class="details">
        <div class="detail-row">
          <span class="detail-label">ID сделки</span>
          <span class="detail-value">${deal.dealId}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Товар/услуга</span>
          <span class="detail-value">${deal.productName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Комиссия сервиса</span>
          <span class="detail-value">${deal.commission.toFixed(2)} ${deal.asset}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Адрес получателя</span>
          <span class="detail-value" style="font-size: 12px;">${toAddress}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Дата</span>
          <span class="detail-value">${date}</span>
        </div>
      </div>

      <a href="https://tronscan.org/#/transaction/${txHash}" class="tx-link">
        🔗 Посмотреть транзакцию в блокчейне
      </a>
    </div>

    <div class="footer">
      <p>Это автоматическое уведомление от сервиса KeyShield.</p>
      <p>Если у вас есть вопросы, свяжитесь с нами: <a href="mailto:support@keyshield.me">support@keyshield.me</a></p>
      <p style="margin-top: 15px;">© ${new Date().getFullYear()} KeyShield. Все права защищены.</p>
    </div>
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
