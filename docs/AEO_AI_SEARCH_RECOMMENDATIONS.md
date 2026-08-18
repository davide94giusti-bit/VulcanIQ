# AEO / AI-search recommendations — 2026-08-18

## Position

vulcanIQ should treat answer-engine / generative-search readiness as an extension of strong technical SEO, entity clarity, first-hand expertise and crawlable public content. This release deliberately does **not** add an `llms.txt` ranking tactic, special “AI schema”, mass-generated FAQ pages, or other unverified shortcuts.

## Implemented foundation

- One canonical production origin: `https://vulcaniq.it`.
- Truthful sitemap containing only implemented public/legal routes.
- Explicit not-found handling instead of unknown URLs masquerading as Home.
- Localized canonical/hreflang metadata for Italian and English variants.
- Centralized structured-data builders for supported, visible entities.
- No self-serving `aggregateRating` markup for vulcanIQ's own LocalBusiness reviews.
- Review UX keeps first-party and Google-provider attribution explicit.
- Public/admin indexing boundaries are clearer, including Preview runtime noindex handling.

## Highest-value content opportunities

The next content pass should answer real pre-booking questions with concise, factual answers followed by useful detail. Owner confirmation is required before publication for operational, safety or credential claims.

Candidate topics:

- How do the vulcanIQ Etna experiences differ?
- Which experiences are suitable for families and children?
- What clothing and equipment should guests bring?
- How difficult is each route and what fitness level is expected?
- How can weather or volcanic conditions change an excursion?
- What is the difference between a fixed and private excursion?
- Where are meeting points and what transport assumptions apply?
- How long does each experience normally take?
- What happens when conditions make the planned route unsuitable?
- What does a volcanological guide do during an Etna experience?
- How is route/safety suitability assessed?

## Entity and expertise signals

Strengthen the public explanation of the business and guide only with verifiable facts. Useful fields/content may include:

- guide name and professional role;
- qualifications that the owner can substantiate;
- direct Etna/local experience;
- safety and route-selection methodology;
- who each experience is designed for;
- dates when factual guide/safety content was last reviewed.

Do not manufacture credentials or imply certifications that are not documented.

## Content design principles

- Lead with the answer when a visitor has a concrete question.
- Keep important facts in visible text, not only images, videos or accordions.
- Use descriptive headings and stable information architecture.
- Prefer original, experience-based guidance over generic tourism copy.
- Keep detected digital attribution separate from customer-declared attribution.
- Use FAQs only where they genuinely help guests; do not create schema solely to target rich results.

## AI crawler policy

Search indexing, AI-search grounding and model-training controls are separate policy choices. Before adding crawler-specific rules, verify the current official crawler names and directives and document the business decision. Do not block normal search crawling while attempting to restrict model training.

## Measurement

Use Search Console, normal web analytics and conversion funnels to assess whether useful content attracts qualified traffic. Do not invent an “AI visibility score” without a defensible data source. Where search platforms expose AI-feature traffic/reporting, treat it as an additional acquisition dimension rather than a replacement for normal SEO measurement.

## Deferred to frontend modernization

- Potential `/it/...` and `/en/...` route migration.
- Build-time prerender/static HTML shells for public routes.
- Major public information-architecture redesign.
- A dedicated editorial knowledge/content workflow if the amount of expert content grows enough to justify it.
