# vulcanIQ owner guide

This guide is for Leonardo and Deborah. It explains the admin area in non-technical terms.

## Log in

1. Open `/admin` or `/admin/login`.
2. Enter your owner email and password.
3. The default page is **Today**.

If access is denied, the email is not active in `admin_profiles`.

## Public site structure

The public website is now organized as page-like sections from the header:

- Home / Inizio
- Experiences / Esperienze
- Upcoming excursions / Prossime escursioni
- Partnerships / Collaborazioni
- About us / Chi siamo
- Mission / Missione
- Reviews / Recensioni
- Contact / Contatti

Visitors no longer need to scroll through one long landing page. Each header button opens the relevant content directly.

## Today

The **Today** dashboard shows:

- requests dated today
- all pending requests needing attention
- accepted requests for today
- near-term availability blocks
- recent decisions, including declined requests
- quick links for request history and availability

Use this page for daily operations.

## Upcoming accepted bookings

Open **Upcoming** to see accepted future bookings grouped by:

- today
- tomorrow
- next 7 days
- later upcoming

This admin page is operational only. It is separate from the public **Upcoming excursions** page.

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

## Fixed excursions / public Upcoming excursions

Fixed excursions are set dates that visitors can request to join. They appear publicly under **Upcoming excursions / Prossime escursioni**.

1. Open `/admin/availability`.
2. Select **Fixed excursions**.
3. Add:
   - date
   - start time
   - optional end time
   - experience
   - title IT and/or EN
   - description IT and EN
   - meeting point IT and EN
   - difficulty IT and EN
   - price note IT and EN
   - capacity, normally 12
   - active/inactive
4. Save.

Public visitors can request a place. Requests remain pending until an owner accepts them.

Capacity counts accepted participants only. Pending requests do not automatically reduce public capacity.

For groups larger than 12 people, ask the customer to contact the guide directly so the most suitable experience can be evaluated.

## Partnerships / Collaborazioni

Partnerships are public collaborations visible on the public **Partnerships / Collaborazioni** page.

1. Open `/admin/partnerships`.
2. Add:
   - name
   - category IT and EN
   - description IT and EN
   - optional website URL
   - optional image URL
   - display order
   - active/inactive
3. Save.

Only active partnerships appear publicly. Use **display order** to control ordering. If no partnerships are active, the public page shows an empty-state message.

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

## Public request behavior

Visitors can request:

- a fixed excursion from the public **Upcoming excursions** page;
- a fixed excursion from the contact form selector;
- a private excursion from the contact page.

Fixed excursion requests save as pending and include `fixed_excursion_id`.

## Language content

Keep Italian and English fields updated wherever both exist:

- fixed excursion titles/descriptions/meeting points/difficulty/price notes
- partnership categories/descriptions
- public request copy when relevant

If only one language is entered for a fixed excursion or partnership, the site falls back gracefully, but bilingual content is preferred.

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
