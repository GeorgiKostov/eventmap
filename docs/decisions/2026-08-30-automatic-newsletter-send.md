# Automatic Thursday newsletter delivery

> Status: approved by George; implemented locally, not yet published · Date: 2026-08-30

## Context

The Thursday workflow originally prepared a frozen Linz digest and required George to press Send.
That was the right launch posture while the list was empty and the first ranked digest was still
exposing data-quality bugs. With confirmed subscribers now present, George asked for the local issue
to go out automatically each Thursday to whoever has completed double opt-in.

Future weekend snapshots can already exist for SEO pages, so the mere presence of a snapshot is not
proof that somebody prepared it for this Thursday. Unattended delivery also removes the human check
that previously caught removed or changed events.

## Decision

- At 09:00 UTC each Thursday, rebuild the current **Linz** issue from production data and notify the
  operator that the desk is ready.
- At 14:00 UTC, ask the deployed application to send that issue to the confirmed, active subscribers
  whose chosen locality falls inside the Linz channel catchment. The audience is read at send time,
  so somebody who confirms between preparation and delivery is included.
- Fail closed unless the snapshot is at most eight hours old, contains at least five picks, and every
  frozen event is still published, eligible, in-window, in-catchment, and unchanged.
- Keep the existing per-recipient database ledger and add a deterministic Resend idempotency key for
  the initial delivery. A workflow retry sends only recipients who were not already accepted.
- The scheduled service token can request only the non-forced Linz send. It cannot edit the digest,
  send another city, or override the already-sent ledger.
- Keep social posting manual. Do not send Plovdiv or another paused city merely because it has a
  subscriber; each city needs fresh local coverage and an explicit launch decision.

## Consequences

The desk remains available during the five-hour review window for replacement, reordering, test mail,
or dropping a pick. If freshness, inventory, eligibility, mail configuration, or delivery fails, the
workflow fails visibly and no completed-send ledger is written. Automatic delivery becomes live only
after the repository change is published and the matching application route is manually deployed.
