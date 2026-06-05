// Optional future Google Calendar sync endpoint for vulcanIQ availability.
// This file is intentionally safe as a placeholder: it does not expose Google API secrets.
// Production pattern:
// 1. Create a separate Google Calendar named "vulcanIQ Availability".
// 2. Store Google credentials as Netlify environment variables.
// 3. Fetch all-day events securely in this function.
// 4. Transform event titles into the same shape used by /public/availability.json.
// 5. Return local JSON as fallback if Google sync fails.

export async function onRequest() {
  return new Response(
    JSON.stringify({
      source: "fallback-placeholder",
      availability: []
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300"
      }
    }
  );
}
