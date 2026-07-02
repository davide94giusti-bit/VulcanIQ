# vulcanIQ Booking Code / Questionnaire Patch — Implementation Report

## Files changed

- `src/main.jsx`
- `main.jsx`
- `src/styles.css`
- `styles.css`
- `src/services/bookingCodes.js`
- `supabase/migrations/20260702_booking_codes.sql`
- `IMPLEMENTATION_REPORT.md`

## Migration added

Added `supabase/migrations/20260702_booking_codes.sql`.

The migration creates:

- `public.booking_codes`
- indexes for code, status, scheduled date, created date, redeemed date
- RLS admin policies for listing, creating, and updating booking codes
- `public.redeem_booking_code(input_code text, input_language text)` RPC for public-safe redemption

The RPC validates the code, prevents duplicate redemption, creates the linked booking request, creates the linked finance income entry, updates the code as redeemed, and returns only safe confirmation data to the public UI.

## Admin booking code behavior

Implemented a new admin section:

- Italian: `Codici prenotazione`
- English: `Booking codes`
- Route: `/admin/booking-codes`

Admins can:

- list booking codes
- filter by status
- search by code, customer, phone, or email
- generate a booking code through a full-screen admin modal
- select only future available fixed/brochure-based excursions
- enter customer details, source, expected amount, expiry, and internal note
- copy the generated code
- cancel unused codes

## Public booking code behavior

Implemented public booking CTA split:

- `Book now / Prenota ora`
- `Book with code / Prenota con codice`

When code mode is active, the second button becomes:

- `Book without code / Prenota senza codice`

The customer can submit a normalized booking code. On success, a full-screen confirmation popup displays:

- customer name
- booked experience
- date/time when available
- meeting point when available
- amount
- buttons to contact vulcanIQ and open the meeting point map when available

Invalid, already used, expired, and cancelled codes receive separate translated errors.

## Finance integration behavior

On successful code redemption, the Supabase RPC creates a finance income entry with:

- `type = income`
- category based on fixed/private booking context
- expected amount and currency
- linked booking request
- linked fixed excursion when available
- payment method/source marker `booking_code`

The operation is handled in the same database function as booking creation to reduce duplicate/partial-record risk.

## Admin booking/request integration

On successful code redemption, the RPC creates an accepted booking request with:

- customer details
- selected experience
- fixed excursion/date where applicable
- booking code
- source section `booking_code`
- source CTA `booking_code_redeem`
- internal note from the generated code
- message explaining the booking was confirmed through an admin-generated code

## Questionnaire behavior

The homepage `Find the right experience / Trova l’esperienza giusta` CTA now opens a guided full-screen questionnaire.

The questionnaire asks about:

- interest
- group type
- pace/intensity
- fixed vs private preference
- language

It then recommends an experience using simple scoring logic and shows relevant future available fixed-excursion dates when configured.

The user can proceed with the recommended experience/date or contact vulcanIQ via WhatsApp.

## Request information fix

The request-information path remains mapped to the booking/contact flow, not to the monthly schedule/leaflet preview.

Added `request_information_clicked` analytics tracking where fixed-excursion request buttons pass the user to the request/contact flow.

Monthly schedule/leaflet opening remains isolated to the brochure/schedule buttons.

## Analytics added

Added/used events:

- `booking_code_mode_opened`
- `booking_code_mode_closed`
- `booking_code_submitted`
- `booking_code_redeemed`
- booking-code error events by error code
- `admin_booking_code_created`
- `admin_booking_code_cancelled`
- `find_experience_started`
- `find_experience_completed`
- `recommended_experience_selected`
- `request_information_clicked`

## Build result

Command run:

```bash
npm install
npm run build
```

Result: build completed successfully.

Vite emitted only the existing/standard chunk-size warning because the main JS bundle is larger than 500 kB after minification. No build errors.

## Conflict marker check result

Command run:

```bash
grep -RIn --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git -E '^(<<<<<<<|=======|>>>>>>>)' .
```

Result: no conflict markers found.

## Known limitations

- I could not execute the Supabase migration against the live project database from this local sandbox.
- I could not perform live authenticated admin UI tests or live public code redemption against production Supabase.
- The feature records expected compensation and finance income. It does not process payment.
- The available-experience dropdown currently uses future available fixed excursions/brochure-based scheduled entries. If private-only manually booked experiences should also generate codes without a fixed date, that can be added as a second admin option.
