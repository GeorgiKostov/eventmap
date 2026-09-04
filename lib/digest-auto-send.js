// Fail-closed checks for unattended newsletter delivery. The scheduled job
// must never turn an old SEO snapshot or a newly changed/cancelled event into
// mail. Keep this pure so the safety decision is directly testable.
import { newsletterEdition } from './newsletter-market.js';

export const AUTO_SEND_MAX_AGE_MS = 8 * 60 * 60 * 1000;

export function automaticDigestRequestAllowed(body, channelSlug, bearerValid) {
  return bearerValid === true
    && body?.automatic === true
    && body?.action === 'send'
    && Boolean(newsletterEdition(channelSlug))
    && !body?.force;
}

const timestamp = (value) => {
  const ms = Date.parse(value || '');
  return Number.isFinite(ms) ? ms : null;
};

export function automaticDigestProblem(digest, currentEvents, { now = new Date(), minimumItems = 5 } = {}) {
  if (!digest) return 'the Thursday digest was not prepared';
  if (!Array.isArray(digest.items) || digest.items.length < minimumItems) {
    return `the digest has fewer than ${minimumItems} reviewed picks`;
  }

  const preparedMs = timestamp(digest.preparedAt);
  const ageMs = preparedMs == null ? null : now.getTime() - preparedMs;
  if (ageMs == null || ageMs < -5 * 60 * 1000 || ageMs > AUTO_SEND_MAX_AGE_MS) {
    return 'the digest was not freshly prepared today';
  }

  const currentById = new Map((currentEvents || []).map((event) => [String(event.id), event]));
  for (const item of digest.items) {
    const current = currentById.get(String(item.id));
    if (!current) return `event ${item.id} is no longer eligible`;

    const frozenUpdatedMs = timestamp(item.eventUpdatedAt);
    const currentUpdatedMs = timestamp(current.updated_at);
    if (frozenUpdatedMs == null || currentUpdatedMs == null || currentUpdatedMs > frozenUpdatedMs) {
      return `event ${item.id} changed after the digest was prepared`;
    }
  }

  return null;
}
