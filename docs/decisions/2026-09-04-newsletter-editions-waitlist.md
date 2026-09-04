# Explicit newsletter editions and city launch waitlist

> Status: approved by George; live in production · Date: 2026-09-04
> Supersedes: `2026-08-30-austria-only-newsletter.md`

## Context

Only Linz has enough repeatable coverage for a weekly newsletter. The previous signup accepted any
Austrian locality, however, so people could confirm a newsletter that the delivery system could not
send. It also hid signup outside Austria even when a visitor only wanted to hear when their city
became available.

## Decision

- A subscriber explicitly chooses either a live recurring edition or the city launch waitlist.
- Linz and surroundings is the only live edition. The API stores that choice as
  `subscription_kind='edition'` and `channel_slug='linz'`; every delivery path requires both values.
- A visitor whose city is not live can choose “notify me when my city is available.” The structured
  city and country are stored as `subscription_kind='waitlist'` with no channel assignment. During
  validation the resolver supports the map's served countries: Austria, Bulgaria and Germany.
- The waitlist consent covers one launch notification for the selected city, not recurring email.
  Opening a city never silently converts waitlist rows into newsletter subscribers; the recipient
  must choose and confirm the live edition.
- Existing confirmed active subscribers receive one service email asking them to review this new
  explicit choice. Pending, unsubscribed and tokenless rows are not contacted. The campaign uses a
  durable per-recipient ledger and provider idempotency keys.
- Preferences are editable through a tokenized, noindex page. Changing the choice records the
  current consent version, time and hashed IP without exposing the email address in the page or URL.

## Consequences

Signup now makes the actual product promise visible before consent. Graz and Plovdiv subscribers can
remain on a city launch waitlist without receiving a Linz issue; only explicit Linz-edition rows are
eligible for the Thursday send. Adding another recurring city remains a separate product launch
decision gated by coverage and Linz retention.

The change is live from commit `d9b88c0`, production deployment
`dpl_Dm2b5PUDBmbKsuTu3Khad6EsHJXJ`. The one-time campaign was accepted for all three confirmed
active subscribers; its completion and recipient ledgers prevent duplicate sends.
