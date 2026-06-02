/**
 * Anonymization helpers for the manager cabinet.
 *
 * Managers must NEVER see:
 *   - telegramId (buyer/seller/openedBy/arbiterId values)
 *   - @username / firstName
 *   - personal wallet addresses (de-anonymize across chain)
 *
 * They SEE only:
 *   - dealId (DL-000034)
 *   - productName, description
 *   - asset, amount, commission, commissionType
 *   - deadline, status, createdAt
 *   - multisigAddress (escrow, neutral)
 *   - depositTxHash, depositDetectedAt, actualDepositAmount
 *   - dispute reason text + media
 *   - chat messages with role labels (buyer/seller/arbiter)
 *
 * Functions return PLAIN objects safe to send over the wire.
 */

function roleLabel(role) {
  return role === 'buyer' ? 'Покупатель'
       : role === 'seller' ? 'Продавец'
       : role === 'arbiter' ? 'Арбитр'
       : 'Участник';
}

/**
 * Convert a Deal (lean or mongoose doc) to a manager-safe object.
 */
function anonymizeDeal(deal) {
  if (!deal) return null;
  const d = deal.toObject ? deal.toObject() : deal;
  return {
    _id: d._id,
    dealId: d.dealId,
    productName: d.productName,
    description: d.description,
    asset: d.asset,
    amount: d.amount,
    commission: d.commission,
    commissionType: d.commissionType,
    deadline: d.deadline,
    status: d.status,
    multisigAddress: d.multisigAddress,
    depositTxHash: d.depositTxHash,
    depositDetectedAt: d.depositDetectedAt,
    actualDepositAmount: d.actualDepositAmount,
    createdAt: d.createdAt
  };
}

/**
 * Convert a Dispute (with optional populated dealId) to a manager-safe object.
 * `openedByRole` is derived from `openedBy` vs the deal's buyer/seller telegramIds.
 */
function anonymizeDispute(dispute) {
  if (!dispute) return null;
  const d = dispute.toObject ? dispute.toObject() : dispute;

  let openedByRole = null;
  if (d.dealId && typeof d.dealId === 'object') {
    if (d.openedBy === d.dealId.buyerId) openedByRole = 'buyer';
    else if (d.openedBy === d.dealId.sellerId) openedByRole = 'seller';
  }

  // Comments may include arbiter notes (userId === 0) or party messages.
  // Strip userId from party comments; keep arbiter notes labelled.
  const comments = (d.comments || []).map((c) => {
    let role = null;
    if (c.userId === 0) role = 'arbiter';
    else if (d.dealId && typeof d.dealId === 'object') {
      if (c.userId === d.dealId.buyerId) role = 'buyer';
      else if (c.userId === d.dealId.sellerId) role = 'seller';
    }
    return {
      role,
      roleLabel: role ? roleLabel(role) : 'Участник',
      text: c.text,
      media: c.media || [],
      createdAt: c.createdAt
    };
  });

  return {
    _id: d._id,
    deal: anonymizeDeal(d.dealId),
    openedByRole,
    openedByRoleLabel: openedByRole ? roleLabel(openedByRole) : null,
    reasonText: d.reasonText,
    media: d.media || [],
    comments,
    status: d.status,
    decision: d.decision,
    resolvedAt: d.resolvedAt,
    createdAt: d.createdAt
  };
}

/**
 * Convert a DisputeChat to a manager-safe object.
 * Crucially: `buyerTelegramId` and `sellerTelegramId` are STRIPPED.
 * `parties` object is removed entirely.
 */
function anonymizeChat(chat) {
  if (!chat) return null;
  const c = chat.toObject ? chat.toObject() : chat;
  return {
    _id: c._id,
    disputeId: c.disputeId,
    deal: typeof c.dealId === 'object' ? anonymizeDeal(c.dealId) : { _id: c.dealId },
    status: c.status,
    resolution: c.resolution,
    nextSeq: c.nextSeq,
    messages: (c.messages || []).map((m) => ({
      seq: m.seq,
      from: m.from,
      fromRoleLabel: roleLabel(m.from),
      text: m.text,
      file: m.file ? {
        kind: m.file.kind,
        safeFileName: m.file.safeFileName,
        size: m.file.size,
        mimeType: m.file.mimeType
        // telegramFileId, hash stripped — not needed by UI
      } : null,
      // Delivery flags exposed without per-side telegramIds (role names are enough)
      delivery: m.delivery,
      createdAt: m.createdAt
    })),
    closedAt: c.closedAt,
    createdAt: c.createdAt
    // buyerTelegramId, sellerTelegramId, arbiterId, telegramMessageIds, introMessageIds — STRIPPED
  };
}

module.exports = {
  anonymizeDeal,
  anonymizeDispute,
  anonymizeChat,
  roleLabel
};
