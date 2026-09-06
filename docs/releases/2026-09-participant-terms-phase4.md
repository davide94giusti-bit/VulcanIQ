# Participant and Terms completion — Admin release note

Status: prepared for controlled Preview UAT. Production Cron is **OFF** and no legal Terms have been published by this implementation.

## What changed

After a booking is accepted, its owned-booking area can show the named participants without changing the booking's canonical adult/child totals. Each participant is identified operationally as an organizer/adult, additional adult, or minor with a configured adult guardian.

The organizer accepts applicable excursion Terms only for themselves. An additional adult receives a private invitation at the email address entered for that delivery and accepts personally. If the organizer is a minor's configured guardian, the organizer uses the owned-booking guardian acknowledgement. A different configured guardian receives a private email invitation.

The organizer and Admin never receive or see another participant's raw acceptance credential. The invitation email address is not added to booking notification preferences. Notification ownership and Terms acceptance are separate records.

Phase 4 adds conservative completion reminders to the existing owned notification journey. Once activated, a reminder can be created only for an accepted, still-active booking that has:

- applicable published excursion Terms;
- a complete participant composition;
- at least one missing acceptance;
- an active owned notification destination with Activity reminders enabled.

The first reminder waits 24 hours after the latest relevant booking, Terms, participant, or acceptance state change. At most one reminder is generated per booking per Europe/Rome calendar day. Completion, booking closure, notification disconnect, or disabled reminders stop queued work. Reminders never create or resend participant acceptance invitations automatically.

## Statuses admins will see

- **Pending:** applicable acceptance evidence is still missing.
- **Invitation sent · Pending:** a private email invitation exists but has not been accepted.
- **Invitation expired:** its 24-hour credential is no longer usable; acceptance is still required.
- **Invitation revoked:** the invitation was stopped; acceptance is still required.
- **Accepted:** immutable evidence exists for the applicable Terms version.
- **Parent/guardian acceptance required:** a minor requires action by the configured adult guardian.
- **Complete:** the participant composition matches the booking totals and every required participant has applicable evidence.

The notification operations view also shows the participant-Terms automation rule and recent reminder jobs, including scheduled, sent, cancelled, retrying, or failed outcomes. It never shows bearer credentials or notification-device secrets.

## What admins should not do

- Do not accept Terms for an unrelated adult.
- Do not ask participants to forward or share private invitation links.
- Do not fabricate participant names to make the composition appear complete.
- Do not edit Terms evidence directly.
- Do not treat an email invitation, push subscription, or notification ownership as acceptance.
- Do not publish legal text unless the exact IT/EN versions have owner/legal approval.

## Privacy and security

Acceptance credentials are hash-only at rest and are not displayed in Admin, D1, analytics, or logs. Detailed names remain inside the protected owned-booking/Admin context; reminder push and inbox copy is generic. Disconnecting Personal updates stops future reminders but does not remove participant records, invitations, or immutable acceptance evidence.

The one-send invitation address is not persisted in VulcanIQ booking, participant, Supabase invitation, D1 ownership, or notification-preference records. The configured email provider necessarily processes that destination under its own retention terms.
