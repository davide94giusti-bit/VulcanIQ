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
- Contact us / Contattaci

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

Request history is compressed into expandable groups. Pending is open by default; accepted, declined, cancelled, and archived groups are collapsed until opened. Declined and cancelled requests stay here. They do not disappear and are not deleted.

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

The app prepares reply text, but you still send it manually by WhatsApp, email, or copy. Once accepted, the request receives a unique booking code that can be shared with the customer for leaving a review after the experience.

## Decline a request

1. Open the pending request.
2. Click **Decline**.
3. Choose a reason.
4. Add a note if useful.
5. Confirm.

The request status becomes `declined`. It remains visible in **Requests** and in **Recent decisions** on Today.


## Remove or cancel an accepted request

Accepted requests can be removed without deleting the historical record.

1. Open **Requests**.
2. Expand **Approved / accepted**.
3. Open the accepted request and click **Remove / cancel**.
4. Add a note if useful.
5. Confirm.

The status becomes `cancelled`. If the request was linked to a fixed excursion, the accepted participant count decreases and remaining capacity is recalculated.

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
   - optional blocked/occupied dates calendar file: PDF, JPEG, PNG, or WEBP
   - capacity, normally 12
   - active/inactive
4. Save.

Public visitors can request a place. Requests remain pending until an owner accepts them.

Capacity counts accepted participants only. Pending and cancelled requests do not reduce public capacity. If you upload a blocked-date file, public visitors see it with that fixed excursion under **Upcoming excursions**.

For groups larger than 12 people, ask the customer to contact the guide directly so the most suitable experience can be evaluated.

## Partnerships / Collaborazioni

Partnerships are public collaborations visible on the public **Partnerships / Collaborazioni** page.

1. Open `/admin/partnerships`.
2. Add:
   - name
   - category IT and EN
   - description IT and EN
   - optional website URL
   - image upload or optional image URL
   - display order
   - active/inactive
3. Save.

Only active partnerships appear publicly. Use **display order** to control ordering. If no partnerships are active, the public page shows an empty-state message. If no image is attached, the card uses a clean fallback.

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


## Public reviews

Customers can leave a public review only with their unique booking code. The code is generated when a request is accepted.

Review flow:

1. Accept the booking request.
2. Copy/send the prepared confirmation message, which includes the booking code when available.
3. The customer opens **Reviews / Recensioni** and enters the booking code, name, rating, and review text.
4. The code can be used only once.

Admin review controls are in **Requests**, under **Public reviews / Recensioni pubbliche**. You can hide an inappropriate review or republish it later.

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

## New admin calendar

Open **Calendar / Calendario** from the admin header. It shows a monthly operational calendar:

- green markers: fixed excursions;
- red markers: accepted customer bookings;
- grey markers: blocked or unavailable dates.

Click a marked date to see every fixed excursion, accepted booking, and block for that day. Use **Edit / Modifica** to update booking status, confirmed date, guest counts, notes, fixed-excursion time, capacity, title, or active state.

## Monthly leaflets

Open `/admin/availability` and select **Monthly leaflets / Calendari mensili**.

1. Choose month and year.
2. Add an Italian and/or English title.
3. Upload a PDF, JPG, PNG, or WEBP monthly calendar/leaflet.
4. Save.
5. Open **Fixed excursions / Escursioni fisse** and link individual fixed dates to that monthly leaflet using the linked leaflet field.

Each fixed date can still have its own title, time, capacity, meeting point, difficulty, price note, and description. The public **Upcoming excursions** calendar marks available fixed dates with a green circle.

## Site media manager

Open **Media** from the admin header. You can replace public media slots without editing code, including:

- home hero background;
- home hero image/video;
- mission image;
- Leonardo and Deborah images;
- default experience images;
- review image slot.

Uploaded media is stored in Supabase Storage. If no uploaded media exists, the site keeps using the static fallback asset.

## Partnership images

The partnership form now supports image upload, preview, replacement, and removal. Uploaded images appear on the public **Partnerships / Collaborazioni** page. If no image is attached, the public card shows a clean fallback instead of a broken image.

## Latest admin update: archive, content, finance, reviews, and calendar details

### Public Mission page

The Mission page now uses a balanced editorial layout:

- Mission and Vision appear as the top two primary cards.
- The oversized mission hero statement has been removed.
- The Mission image is centered using `object-fit: cover` and `object-position: center center`.
- Principles are shown in a compact grid next to or under the image depending on screen size.

### Public Reviews page

The Reviews page now uses a horizontal page header with the review submission button separated from the review cards. The button is not absolutely positioned and should not overlap cards.

Admins and public users can sort visible reviews by:

- Più recenti / Most recent
- Voto più alto / Highest score
- Voto più basso / Lowest score

Review submission still uses the booking-code modal. Booking-code validation remains handled by Supabase through the `submit_public_review` function.

### Admin archive and past experiences

Admin sections separate active items from historical ones:

- Requests are grouped by status, with declined/cancelled/archived items collapsed by default.
- Availability blocks have an Archive section.
- Fixed excursions have an Esperienze passate / Archivio section.
- Monthly leaflets have an Archive section.
- Upcoming bookings include an Esperienze passate / Past experiences panel.

Archived, inactive, declined, cancelled, and past items remain visible to admins for reference, but they are not mixed into active operational lists.

### Admin calendar modal and guest details

The admin calendar modal now has a fully opaque card and a darker blurred backdrop, so the calendar behind it no longer interferes with readability.

When a fixed excursion has linked accepted bookings, the date detail panel shows booked guest information where available:

- customer name
- email
- phone / WhatsApp
- guest count
- booking code

If no guests are booked, the panel shows: `Nessun ospite prenotato per questa data.` / `No guests booked for this date yet.`

### Finance / Finanze

The admin dashboard includes a new `Finanze / Finance` section. This is an internal ledger only; it is not a payment processor.

Admins can:

- add income entries
- add expense entries
- edit entries
- archive entries
- filter by type, category, date range, and linked/unlinked status
- link entries to booking requests
- link entries to fixed excursions
- link entries to monthly leaflets

The summary cards calculate:

- Entrate totali / Total earnings
- Uscite totali / Total expenses
- Utile netto / Net profit
- Prenotazioni collegate / Linked bookings
- Spese non collegate / Unlinked expenses

Finance data is protected by admin-only RLS. Public visitors must never be able to read finance entries.

### Content / Contenuti

The admin dashboard includes a `Contenuti / Content` section for public copy. Admins can edit Italian and English text without changing code.

Currently managed through this section:

- Homepage hero title
- Homepage hero subtitle
- Homepage CTA labels
- Mission title and body
- Vision title and body
- Principles labels
- Reviews page title
- Reviews intro
- Publish review button label
- Contact page title and intro entries for future extension

Public pages load active admin-managed content first. If a field is empty or missing, the website falls back to the default static text so headings and cards do not break.

