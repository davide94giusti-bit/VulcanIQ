# vulcanIQ owner guide

This guide is for Leonardo and Deborah. It explains the admin area in non-technical terms.

## Log in

1. Open `/admin`.
2. Enter your owner email and password.
3. The default page is **Today**.

If access is denied, the email is not active in `admin_profiles`.

## Today

The **Today** dashboard shows:

- requests dated today
- all pending requests needing attention
- accepted requests for today
- near-term availability blocks
- recent decisions, including declined requests
- quick links for request history and availability

Use this page for daily operations.

## Upcoming

Open **Upcoming** to see accepted future bookings grouped by:

- today
- tomorrow
- next 7 days
- later upcoming

This page is operational only. It is not an analytics dashboard.

## Requests / history

Open **Requests** to search and filter all requests by:

- status: pending, accepted, declined, cancelled, archived
- experience
- source
- date range
- customer search

Declined requests stay here. They do not disappear and are not deleted.

## Approve a request

1. Open the pending request.
2. Review customer contact, requested date, experience, group type, adults, children, and message.
3. Click **Approve**.
4. Choose one option:
   - accept only
   - accept and close this experience
   - accept and close all experiences
   - accept and mark limited availability
5. Add a decision note if useful.
6. Confirm.

The app prepares reply text, but you still send it manually by WhatsApp, email, or copy.

## Decline a request

1. Open the pending request.
2. Click **Decline**.
3. Choose a reason.
4. Add a note if useful.
5. Confirm.

The request status becomes `declined`. It remains visible in **Requests** and in **Recent decisions** on Today.

## Add a manual request

Use this for requests received outside the website: WhatsApp, phone, email, or direct conversation.

1. Click **Add manual request**.
2. Enter at least a name or contact method.
3. Choose source, request type, group type, experience, date, adults, and children.
4. Save.

The request appears as pending and can be approved or declined.

## Fixed excursions

Fixed excursions are set dates that visitors can request to join.

1. Open `/admin/availability`.
2. Select **Fixed excursions**.
3. Add:
   - date
   - optional start time
   - experience
   - capacity, normally 12
   - note IT
   - note EN
   - active/inactive
4. Save.

Public visitors can request a place. Requests remain pending until an owner accepts them.

Capacity counts accepted participants only. Pending requests do not automatically reduce public capacity.

For groups larger than 12 people, ask the customer to contact the guide directly so the most suitable experience can be evaluated.

## Private availability blocks

Private/general availability uses **Availability blocks**.

You can mark dates as:

- **Closed**: customers cannot directly request the date.
- **Limited**: customers can request, but availability is restricted.
- **On request**: the date may be possible, but needs direct confirmation.

To block a private date:

1. Open `/admin/availability`.
2. Select **Availability blocks**.
3. Choose date, scope, and status.
4. Add public reasons if useful.
5. Save.

To unblock a date, deactivate the block. It is not deleted; it becomes inactive.

## Public calendar behavior

The public calendar has two modes:

- **Fixed excursion**: shows owner-created fixed dates.
- **Private excursion**: shows availability based on closed, limited, and on-request blocks.

The public calendar updates when Supabase is configured and the relevant admin data is saved.

## Reply helpers

Each request has tools for:

- WhatsApp
- Email
- Copy message

If a phone number lacks an international prefix, check it manually before using WhatsApp.

## What is intentionally not included

This phase does not include:

- payments
- invoices
- SMS
- WhatsApp Business API
- customer accounts
- Google Calendar sync
- advanced analytics

The system is intentionally simple and owner-controlled.
