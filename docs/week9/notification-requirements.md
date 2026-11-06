# Notification requirements — awaiting client review

Prepared 24 October 2026. No client contact or approval has occurred during this work. No production trigger, queue, channel, or notification sender is enabled.

| Item | Status | Evidence / decision |
| --- | --- | --- |
| Existing empty notification UI | Confirmed (repository behavior only) | `www/js/notifications.js`: repository returns zero/empty, markAsRead is a stub |
| Notifications feature disabled | Confirmed (repository behavior only) | `www/js/config/app-settings.js`: features.notifications=false, D-NOTIF-1 |
| 20% day-to-day environmental indicator | Pending Client Confirmation for notification use | D-ENV-1 records a client suggestion; parameters and notification semantics remain open |
| Protection breach and missing-reading notifications | Proposed | No approved recipients, thresholds, schedule or delivery channel |
| Admin / assigned engineer routing | Proposed | Existing users.role and test_points.assigned_engineer_id can support routing |
| Delivery, retention, acknowledgement, escalation | Pending Client Confirmation | No confirmed notification backend/data model found |

## Questions for client decision

1. Which events should notify: protection threshold breach, persistent unprotected state, missing readings, environmental change, import/API failure, assigned Test Point changes? Which are out of scope?
2. Who receives each event: all administrators, the assigned engineer, a site team, others? What happens if nobody is assigned or the account is inactive?
3. Which delivery channels: in-app, email, SMS? Is immediate delivery required, or is a daily digest sufficient? What delivery delay is acceptable?
4. Confirm event-specific thresholds and duration, missing-reading cadence, repeat/reminder frequency, cooldown/deduplication, recovery notice, escalation recipients and elapsed time. Does the existing 20% environmental suggestion apply to conductivity, temperature, pH or dissolved oxygen?
5. Is acknowledgement required? By whom? What history, preference/opt-out, retention, audit and export requirements apply? Should acknowledging stop reminders for everyone?
6. Confirm timezone, operating/quiet hours, weekend/holiday handling, priority/severity labels and whether urgent events bypass quiet hours.

## Candidate event mapping — all proposed

| Event | Actual source / module | Feasibility and dependency |
| --- | --- | --- |
| Protection breach | test_point_readings.value_mv, threshold_mv_snapshot, is_protected; services/status.js | Feasible after agreeing consecutive-reading/recovery semantics; reconcile existing fixed system threshold tests with per-point DB snapshots |
| Missing reading | reading_batches.reading_ts joined through test_point_readings; daily summaries | Needs expected sampling schedule and scheduler, no existing per-point SLA confirmed |
| Environmental change | temperature_c, medium_conductivity, ph, dissolved_oxygen; history.js | Needs comparison window, baseline/zero handling and approved parameters |
| API/import failure | PHP structured audit event; JS importer errors | Needs durable error ingestion; a failed transaction cannot persist its own transactional event |
| Assignment changes | test_points.assigned_engineer_id; testpoints.js | Needs approved audit/change capture and recipient policy |

## Decision log and blocked backlog

| Decision | Owner | Status | Next action |
| --- | --- | --- | --- |
| D-NOTIF-1 events/channels/recipients | Client | Pending Client Confirmation | Answer questions above, date/sign agreed matrix |
| Scheduling/quiet hours/retention | Client + data owner | Pending Client Confirmation | Agree service expectations and retention |
| Delivery architecture/vendor/cost | Team + owner | Proposed, blocked by channels | Compare options after requirements |

Blocked implementation backlog: agree event matrix → design RLS-protected notification/preferences/audit tables and reversible migrations → implement transactional outbox plus failure-event capture → scheduled deduplication/reminders/escalation → approved channel adapter → acknowledgement/history/preferences UI → isolated integration/UAT tests. No guessed notification schema or sending scaffolding added. Existing UI rendering was made safe with DOM text APIs as security work.

## Client message draft — not sent

Subject: Week 9 — decisions needed for corrosion monitoring notifications

Hello Zhen Qi,

We have prepared the notification questions above for review. Could you confirm the events, recipients, channels, urgency, thresholds/cooldowns, acknowledgement/history/retention, and timezone/operating hours? In particular, should the 20% environmental indicator generate notifications, and for which parameters?

Please annotate each candidate event with its recipient, channel and timing, and identify exclusions. We will record the agreed decisions before enabling any delivery or production triggers.

Thank you,
SE Team 24
