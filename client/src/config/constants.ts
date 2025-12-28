/**
 * Client-side constants
 * These values are loaded from environment variables at build time
 * For development, edit .env file in the root of the project
 */

// Deal constraints
export const MIN_DEAL_AMOUNT = parseInt(import.meta.env.VITE_MIN_DEAL_AMOUNT || '50'); // Minimum deal amount is 50 USDT

// Commission settings - NEW PRICING MODEL (effective 27.12.2025)
// Tier 1: 0-150 USDT = 6 USDT fixed
export const COMMISSION_TIER_1_MAX = parseInt(import.meta.env.VITE_COMMISSION_TIER_1_MAX || '150');
export const COMMISSION_TIER_1_FIXED = parseFloat(import.meta.env.VITE_COMMISSION_TIER_1_FIXED || '6');

// Tier 2: 150-500 USDT = 3.5%
export const COMMISSION_TIER_2_MAX = parseInt(import.meta.env.VITE_COMMISSION_TIER_2_MAX || '500');
export const COMMISSION_TIER_2_RATE = parseFloat(import.meta.env.VITE_COMMISSION_TIER_2_RATE || '0.035');

// Tier 3: 500-1500 USDT = 3%
export const COMMISSION_TIER_3_MAX = parseInt(import.meta.env.VITE_COMMISSION_TIER_3_MAX || '1500');
export const COMMISSION_TIER_3_RATE = parseFloat(import.meta.env.VITE_COMMISSION_TIER_3_RATE || '0.03');

// Tier 4: 1500+ USDT = 2.5%
export const COMMISSION_TIER_4_RATE = parseFloat(import.meta.env.VITE_COMMISSION_TIER_4_RATE || '0.025');

// Auto-ban settings
export const AUTO_BAN_LOSS_STREAK = 3;

// Supported assets
export const SUPPORTED_ASSETS = ['USDT'];
