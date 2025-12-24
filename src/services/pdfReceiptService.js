/**
 * PDF Receipt Service
 *
 * Generates PDF receipts for completed transactions.
 * 2-page document matching admin export style:
 * - Page 1: Title page with receipt number
 * - Page 2: Deal and transaction details
 *
 * IMPORTANT: Receipt number and date are deterministic (based on deal data)
 * so every download produces identical copies.
 */

const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

class PdfReceiptService {
  constructor() {
    this.fontPath = path.join(__dirname, '../../client/public/fonts/Roboto.ttf');
  }

  /**
   * Generate deterministic receipt number based on deal data
   * Same deal + same recipient type = same receipt number always
   */
  generateReceiptNumber(deal, transaction) {
    // Use deal completion date for the date part
    const completedAt = deal.completedAt ? new Date(deal.completedAt) : new Date(deal.createdAt);
    const dateStr = completedAt.toISOString().slice(0, 10).replace(/-/g, '');

    // Generate deterministic hash from dealId + transaction type
    const hashInput = `${deal.dealId}-${transaction.type}`;
    const hash = crypto.createHash('md5').update(hashInput).digest('hex');
    const shortHash = hash.substring(0, 6).toUpperCase();

    return `${dateStr}-${shortHash}`;
  }

  /**
   * Get receipt date (deal completion date)
   */
  getReceiptDate(deal) {
    const completedAt = deal.completedAt ? new Date(deal.completedAt) : new Date(deal.createdAt);
    return completedAt.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }) + ' (МСК)';
  }

  /**
   * Generate PDF receipt for a transaction
   * @param {Object} deal - Deal object
   * @param {Object} transaction - Transaction data (type, amount, txHash, toAddress)
   * @param {Object} user - User who receives the receipt
   * @returns {Promise<Buffer>} PDF buffer
   */
  async generateReceipt(deal, transaction, user) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
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

        const { type, amount, txHash, toAddress } = transaction;
        const isRefund = type === 'refund';
        const isPurchase = type === 'purchase';

        // Deterministic receipt number and date
        const receiptNumber = this.generateReceiptNumber(deal, transaction);
        const receiptDate = this.getReceiptDate(deal);

        // Determine type text
        let typeText, statusText, amountLabel;
        if (isRefund) {
          typeText = 'ЧЕК ВОЗВРАТА';
          statusText = 'Возврат выполнен';
          amountLabel = 'Сумма возврата';
        } else if (isPurchase) {
          typeText = 'ЧЕК О ПОКУПКЕ';
          statusText = 'Покупка завершена';
          amountLabel = 'Сумма покупки';
        } else {
          typeText = 'ЧЕК О ВЫПЛАТЕ';
          statusText = 'Выплата получена';
          amountLabel = 'Сумма выплаты';
        }

        const statusColors = {
          release: '#10b981',  // green
          purchase: '#3b82f6', // blue
          refund: '#f59e0b'    // yellow
        };
        const statusColor = statusColors[type] || '#10b981';

        // ===== PAGE 1: TITLE PAGE =====
        this.drawTitlePage(doc, {
          receiptNumber,
          receiptDate,
          typeText,
          statusText,
          statusColor,
          amountLabel,
          amount,
          deal,
          user
        });

        // ===== PAGE 2: DETAILS PAGE =====
        doc.addPage();
        this.drawDetailsPage(doc, {
          receiptNumber,
          receiptDate,
          typeText,
          statusText,
          statusColor,
          amount,
          deal,
          transaction,
          user
        });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Draw title page (Page 1)
   */
  drawTitlePage(doc, data) {
    const { receiptNumber, receiptDate, typeText, statusText, statusColor, amountLabel, amount, deal, user } = data;

    // Top accent bar
    doc.rect(0, 0, 595, 8).fill('#6366f1');

    // Title
    doc.moveDown(4);
    doc.fontSize(42).fillColor('#6366f1').text('KeyShield', { align: 'center' });
    doc.fontSize(14).fillColor('#64748b').text('Безопасные сделки с криптовалютой', { align: 'center' });

    doc.moveDown(4);

    // Receipt box
    doc.rect(150, doc.y, 295, 80).fillAndStroke('#f8fafc', '#e2e8f0');
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor('#64748b').text(typeText, { align: 'center' });
    doc.fontSize(28).fillColor('#1e293b').text(`№${receiptNumber}`, { align: 'center' });

    doc.moveDown(4);

    // Status
    doc.fontSize(24).fillColor(statusColor).text(statusText, { align: 'center' });

    doc.moveDown(2);

    // Amount box
    const amountBoxY = doc.y;
    doc.rect(100, amountBoxY, 395, 70).fillAndStroke(statusColor, statusColor);
    doc.fontSize(12).fillColor('#ffffff').text(amountLabel, 100, amountBoxY + 15, { align: 'center', width: 395 });
    doc.fontSize(32).fillColor('#ffffff').text(`${amount.toFixed(2)} ${deal.asset}`, 100, amountBoxY + 35, { align: 'center', width: 395 });

    doc.moveDown(6);

    // Info section
    doc.fontSize(11).fillColor('#64748b').text('Сделка:', { align: 'center' });
    doc.fontSize(14).fillColor('#6366f1').text(deal.dealId, { align: 'center' });

    doc.moveDown(1);
    doc.fontSize(11).fillColor('#64748b').text('Получатель:', { align: 'center' });
    doc.fontSize(14).fillColor('#1e293b').text(`@${user?.username || 'Неизвестно'} (ID: ${user?.telegramId || 'N/A'})`, { align: 'center' });

    doc.moveDown(1);
    doc.fontSize(11).fillColor('#64748b').text('Дата формирования:', { align: 'center' });
    doc.fontSize(12).fillColor('#1e293b').text(receiptDate, { align: 'center' });

    // Footer
    doc.fontSize(9).fillColor('#94a3b8').text('https://keyshield.me', 50, 750, { align: 'center', link: 'https://keyshield.me' });

    // Bottom accent bar
    doc.rect(0, 834, 595, 8).fill('#6366f1');
  }

  /**
   * Draw details page (Page 2)
   */
  drawDetailsPage(doc, data) {
    const { receiptNumber, typeText, statusColor, amount, deal, transaction, user } = data;

    // Header bar
    doc.rect(0, 0, 595, 40).fill('#6366f1');
    doc.fontSize(14).fillColor('#ffffff').text(`${typeText} №${receiptNumber}`, 50, 12);
    doc.fontSize(10).fillColor('#c7d2fe').text(deal.dealId, 450, 14);

    doc.moveDown(3);

    // Product name and status
    doc.fontSize(18).fillColor('#1e293b').text(deal.productName, 50, 60);
    doc.fontSize(10).fillColor(statusColor).text(data.statusText, 50, 82);

    // Helper functions
    const drawSection = (title, yPos) => {
      doc.rect(50, yPos, 495, 24).fill('#f1f5f9');
      doc.fontSize(11).fillColor('#475569').text(title, 60, yPos + 6);
      return yPos + 30;
    };

    const drawRow = (label, value, y) => {
      doc.fontSize(10).fillColor('#64748b').text(label, 60, y);
      doc.fontSize(10).fillColor('#1e293b').text(String(value || 'Н/Д'), 200, y);
      return y + 18;
    };

    let y = 110;

    // Deal Info
    y = drawSection('Информация о сделке', y);
    y = drawRow('ID сделки:', deal.dealId, y);
    y = drawRow('Товар/услуга:', deal.productName, y);
    const desc = deal.description || '';
    if (desc) {
      y = drawRow('Описание:', desc.substring(0, 50) + (desc.length > 50 ? '...' : ''), y);
    }
    y += 10;

    // Financial
    y = drawSection('Финансовая информация', y);
    y = drawRow('Сумма сделки:', `${deal.amount.toFixed(2)} ${deal.asset}`, y);
    y = drawRow('Комиссия сервиса:', `${deal.commission.toFixed(2)} ${deal.asset}`, y);
    y = drawRow('Сумма транзакции:', `${amount.toFixed(2)} ${deal.asset}`, y);
    y += 10;

    // Transaction
    y = drawSection('Транзакция', y);
    y = drawRow('Тип:', data.typeText, y);
    y = drawRow('Адрес получателя:', transaction.toAddress || 'Н/Д', y);
    if (transaction.txHash && transaction.txHash !== 'N/A') {
      y = drawRow('TX Hash:', transaction.txHash.substring(0, 40) + '...', y);
      doc.fontSize(8).fillColor('#6366f1').text(
        'Проверить на TronScan',
        60, y, { link: `https://tronscan.org/#/transaction/${transaction.txHash}` }
      );
      y += 20;
    }
    y += 10;

    // Recipient
    y = drawSection('Получатель', y);
    y = drawRow('Пользователь:', `@${user?.username || 'Неизвестно'}`, y);
    if (user?.telegramId) {
      y = drawRow('Telegram ID:', user.telegramId, y);
    }
    y += 10;

    // Timeline
    y = drawSection('Дата и время', y);
    const createdDate = new Date(deal.createdAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    y = drawRow('Создана:', createdDate + ' (МСК)', y);
    if (deal.completedAt) {
      const completedDate = new Date(deal.completedAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
      y = drawRow('Завершена:', completedDate + ' (МСК)', y);
    }

    // Footer
    const footerY = 780;
    if (y < footerY) {
      doc.fontSize(9).fillColor('#94a3b8').text(
        'Документ сформирован автоматически системой KeyShield.',
        50, footerY, { align: 'center', width: 495 }
      );
      doc.fontSize(9).fillColor('#6366f1').text(
        'https://keyshield.me',
        50, footerY + 15, { align: 'center', width: 495, link: 'https://keyshield.me' }
      );
    }
  }

  /**
   * Generate filename for receipt
   */
  generateFilename(deal, user, transaction) {
    const receiptNumber = this.generateReceiptNumber(deal, transaction);
    const safeUsername = (user?.username || 'user').replace(/[^a-zA-Z0-9_]/g, '');
    const typePrefix = transaction.type === 'refund' ? 'Refund' : (transaction.type === 'purchase' ? 'Purchase' : 'Receipt');
    return `KeyShield_${typePrefix}_${deal.dealId}_${safeUsername}_${receiptNumber}.pdf`;
  }
}

module.exports = new PdfReceiptService();
