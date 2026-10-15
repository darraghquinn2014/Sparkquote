/**
 * Quote tracking — pure logic for quote statuses and the chase-up nudge.
 */
import type { EstimateStatus } from './types';

export const QUOTE_STATUSES: readonly EstimateStatus[] = ['draft', 'sent', 'accepted', 'declined', 'invoiced'];

export const QUOTE_STATUS_LABELS: Record<EstimateStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  declined: 'Declined',
  invoiced: 'Invoiced',
};

/** A sent quote with no reply after this many days gets a chase-up nudge. */
export const CHASE_UP_AFTER_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between `from` and `now` (both Unix ms), never negative. */
export function daysSince(from: number, now: number): number {
  return Math.max(0, Math.floor((now - from) / DAY_MS));
}

/** True when a quote was sent at least CHASE_UP_AFTER_DAYS ago and is still awaiting a reply. */
export function needsChaseUp(
  quote: { status: EstimateStatus; sentAt?: number },
  now: number,
  afterDays = CHASE_UP_AFTER_DAYS,
): boolean {
  return quote.status === 'sent' && quote.sentAt != null && daysSince(quote.sentAt, now) >= afterDays;
}

/**
 * Timestamps to write when a quote moves to `next`. sentAt is set the first
 * time it's sent (or accepted on the spot) and never moved after, so the
 * chase-up clock doesn't reset if the status is flipped back and forth.
 */
export function statusChange(
  quote: { sentAt?: number },
  next: EstimateStatus,
  now: number,
): { status: EstimateStatus; statusChangedAt: number; sentAt?: number } {
  const sentAt = quote.sentAt ?? (next !== 'draft' ? now : undefined);
  return { status: next, statusChangedAt: now, ...(sentAt != null ? { sentAt } : {}) };
}

/** Ready-to-send follow-up text for a quote awaiting a reply. */
export function chaseUpMessage(opts: {
  clientName?: string;
  sentAt: number;
  totalText: string;
  businessName?: string;
}): string {
  const firstName = opts.clientName?.trim().split(/\s+/)[0];
  const date = new Date(opts.sentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
  const signOff = opts.businessName?.trim() ? `\n\nThanks,\n${opts.businessName.trim()}` : '\n\nThanks';
  return `${greeting} just following up on the quote I sent on ${date} for ${opts.totalText}. Let me know if you have any questions or would like to go ahead.${signOff}`;
}
