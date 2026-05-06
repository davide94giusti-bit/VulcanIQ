# vulcanIQ owner guide

This guide is for Leonardo and the co-owner. It explains how to use the free admin area without technical steps.

## Log in

1. Open `/admin`.
2. Enter your owner email and password.
3. If login is successful, you will see **Today**.

If you see an access denied message, your email may not be active in the owner list.

## Today page

The **Today** page is the main owner dashboard.

It shows:

- requests dated today
- pending requests needing confirmation
- pending total
- accepted requests for today
- availability issues for today
- quick actions

Use this page first when checking daily operations. It is the default landing page after login.


## Upcoming page

Open **Upcoming** to see accepted future bookings grouped by:

- today
- tomorrow
- next 7 days
- later upcoming

This page also shows upcoming closed, limited, and on-request dates. It is practical planning only; analytics and statistics are intentionally not included in this phase.

## Approve a request

1. Go to `/admin`.
2. Find the request under **Pending bookings**.
3. Review:
   - customer name
   - phone/email
   - preferred contact
   - requested experience
   - requested date
   - group details
   - children notes
   - customer message
4. Click **Approve**.
5. Choose one option:
   - **Accept request only**: confirms the request but does not change availability.
   - **Accept and close this experience**: closes only that experience on that date.
   - **Accept and close all experiences**: closes the date for every experience.
   - **Accept and mark limited availability**: keeps the date requestable but marked as limited.
6. Add a decision note if useful.
7. Confirm.

Approving a request does not automatically send a message. Use the generated WhatsApp, email, or copy buttons to reply manually.

## Decline a request

1. Open the pending request.
2. Click **Decline**.
3. Choose a reason:
   - unavailable
   - unsafe conditions
   - unsuitable route
   - duplicate request
   - customer cancelled
   - other
4. Add a note if useful.
5. Confirm.

The request becomes declined. The calendar is not changed automatically.

Use the generated reply buttons to contact the customer manually.

## Reply to a customer

Each request has reply helpers:

- **WhatsApp** opens a normal `wa.me` link if the phone number is available.
- **Email** opens email options.
- **Copy message** copies the prepared message.

If the phone number does not include a country code, check it before opening WhatsApp.

## Add a manual request

Use this when a customer contacts you outside the website: WhatsApp, phone call, email, or direct conversation.

1. Go to `/admin`.
2. Click **Add manual request**.
3. Enter at least a name or contact method.
4. Choose the source:
   - WhatsApp
   - phone
   - email
   - manual
5. Add experience, date, group details, and notes if known.
6. Save.

The request appears as pending and can be approved or declined like a website request.

## Block a date

1. Go to `/admin`.
2. Open **Availability**.
3. Choose the date.
4. Choose the scope:
   - all experiences
   - Etna Premium
   - Etna Learning
   - Etna Live
   - Etna Stories
5. Choose **Closed**.
6. Save.

The public calendar updates automatically when Supabase is configured.

## Mark limited availability

1. Go to `/admin/availability`.
2. Choose the date.
3. Choose all experiences or one experience.
4. Select **Limited availability**.
5. Save.

“Limited” means customers can still request the date, but availability is restricted.

## Mark a date as on request

1. Go to `/admin/availability`.
2. Choose the date.
3. Choose all experiences or one experience.
4. Select **On request**.
5. Save.

“On request” means the date may be possible, but it needs direct confirmation.

## Unblock or deactivate a date

1. Go to `/admin/availability`.
2. Find the existing block.
3. Click **Deactivate / unblock**.

The block is not deleted. It becomes inactive, and the public calendar ignores it.

## Edit an availability block

1. Go to `/admin/availability`.
2. Find the block.
3. Click **Edit**.
4. Change status, public reasons, or internal note.
5. Save.

## What the status labels mean

- **Closed**: customers cannot request that date directly.
- **Limited**: customers can request, but availability is restricted.
- **On request**: the date may be possible, but only after confirmation.

## Public calendar note

Availability is indicative. Final confirmation still depends on:

- weather
- official regulations
- volcanic conditions
- guide assessment
- group age, mobility, clothing, and expectations

## If something looks wrong

1. Refresh `/admin`.
2. Check whether you are still logged in.
3. Check `/admin/availability` for active blocks.
4. If a request was accepted but the calendar did not update, manually block the date in **Availability**.
5. If the public form fails, ask the customer to use WhatsApp or email.

This system is intentionally simple. It is not a full commercial booking platform: no payments, invoices, SMS, WhatsApp Business API, Google Calendar sync, or customer accounts are included in this phase.
