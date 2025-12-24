/**
 * PDF Receipt Service
 *
 * Generates PDF receipts for completed transactions.
 * Same design as admin export but for email receipts.
 */

const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

class PdfReceiptService {
  constructor() {
    this.fontPath = path.join(__dirname, '../../client/public/fonts/Roboto.ttf');
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

        // Generate statement number
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const random = Math.random().toString(36).substring(2, 8).toUpperCase();
        const statementNumber = `${dateStr}-${random}`;

        // Determine type text
        let typeText, statusText, amountLabel;
        if (isRefund) {
          typeText = 'Чек возврата';
          statusText = 'Возврат выполнен';
          amountLabel = 'Сумма возврата';
        } else if (isPurchase) {
          typeText = 'Чек о покупке';
          statusText = 'Покупка завершена';
          amountLabel = 'Сумма покупки';
        } else {
          typeText = 'Чек о выплате';
          statusText = 'Выплата получена';
          amountLabel = 'Сумма выплаты';
        }

        const statusColors = {
          release: '#10b981',  // green
          purchase: '#3b82f6', // blue
          refund: '#f59e0b'    // yellow
        };
        const statusColor = statusColors[type] || '#10b981';

        // ===== HEADER BAR =====
        doc.rect(0, 0, 595, 8).fill('#6366f1');

        // ===== TITLE =====
        doc.moveDown(3);
        doc.fontSize(36).fillColor('#6366f1').text('KeyShield', { align: 'center' });
        doc.fontSize(12).fillColor('#64748b').text('Безопасные сделки с криптовалютой', { align: 'center' });

        doc.moveDown(3);

        // ===== STATEMENT BOX =====
        doc.rect(150, doc.y, 295, 70).fillAndStroke('#f8fafc', '#e2e8f0');
        doc.moveDown(0.5);
        doc.fontSize(11).fillColor('#64748b').text(typeText.toUpperCase(), { align: 'center' });
        doc.fontSize(22).fillColor('#1e293b').text(`№${statementNumber}`, { align: 'center' });

        doc.moveDown(3);

        // ===== STATUS =====
        doc.fontSize(24).fillColor(statusColor).text(statusText, { align: 'center' });

        doc.moveDown(2);

        // ===== AMOUNT BOX =====
        const amountBoxY = doc.y;
        doc.rect(100, amountBoxY, 395, 60).fillAndStroke(statusColor, statusColor);
        doc.fontSize(11).fillColor('#ffffff').text(amountLabel, 100, amountBoxY + 12, { align: 'center', width: 395 });
        doc.fontSize(28).fillColor('#ffffff').text(`${amount.toFixed(2)} ${deal.asset}`, 100, amountBoxY + 28, { align: 'center', width: 395 });

        doc.moveDown(5);

        // ===== HELPER FUNCTIONS =====
        const drawSection = (title, yPos) => {
          doc.rect(50, yPos, 495, 22).fill('#f1f5f9');
          doc.fontSize(10).fillColor('#475569').text(title, 60, yPos + 5);
          return yPos + 28;
        };

        const drawRow = (label, value, y) => {
          doc.fontSize(9).fillColor('#64748b').text(label, 60, y);
          doc.fontSize(9).fillColor('#1e293b').text(String(value || 'Н/Д'), 180, y);
          return y + 16;
        };

        let y = doc.y + 20;

        // ===== DEAL INFO =====
        y = drawSection('Информация о сделке', y);
        y = drawRow('ID сделки:', deal.dealId, y);
        y = drawRow('Товар/услуга:', deal.productName, y);
        y = drawRow('Сумма сделки:', `${deal.amount.toFixed(2)} ${deal.asset}`, y);
        y = drawRow('Комиссия сервиса:', `${deal.commission.toFixed(2)} ${deal.asset}`, y);
        y += 8;

        // ===== TRANSACTION =====
        y = drawSection('Транзакция', y);
        y = drawRow('Адрес получателя:', toAddress, y);
        if (txHash) {
          y = drawRow('TX Hash:', txHash.substring(0, 50) + '...', y);
          doc.fontSize(8).fillColor('#6366f1').text(
            'Проверить на TronScan',
            60, y, { link: `https://tronscan.org/#/transaction/${txHash}` }
          );
          y += 16;
        }
        y += 8;

        // ===== RECIPIENT =====
        y = drawSection('Получатель', y);
        y = drawRow('Пользователь:', `@${user?.username || 'Неизвестно'}`, y);
        if (user?.telegramId) {
          y = drawRow('Telegram ID:', user.telegramId, y);
        }
        y += 8;

        // ===== DATE =====
        y = drawSection('Дата и время', y);
        const dateTime = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
        y = drawRow('Дата формирования:', dateTime + ' (МСК)', y);
        if (deal.completedAt) {
          const completedDate = new Date(deal.completedAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
          y = drawRow('Дата завершения:', completedDate + ' (МСК)', y);
        }

        // ===== FOOTER =====
        doc.fontSize(8).fillColor('#94a3b8').text(
          'Документ сформирован автоматически системой KeyShield.',
          50, 750, { align: 'center', width: 495 }
        );
        doc.fontSize(9).fillColor('#6366f1').text(
          'https://keyshield.me',
          50, 765, { align: 'center', width: 495, link: 'https://keyshield.me' }
        );

        // Bottom bar
        doc.rect(0, 834, 595, 8).fill('#6366f1');

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Generate filename for receipt
   */
  generateFilename(deal, user, transaction) {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const safeUsername = (user?.username || 'user').replace(/[^a-zA-Z0-9_]/g, '');
    const typePrefix = transaction.type === 'refund' ? 'Refund' : (transaction.type === 'purchase' ? 'Purchase' : 'Receipt');
    return `KeyShield_${typePrefix}_${deal.dealId}_${safeUsername}_${dateStr}.pdf`;
  }
}

module.exports = new PdfReceiptService();
