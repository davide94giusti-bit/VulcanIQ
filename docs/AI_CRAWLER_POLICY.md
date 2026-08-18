# AI crawler policy

## Current decision

Keep normal search crawling/indexing enabled. Do not add speculative AI crawler blocks in this release.

Search indexing, AI search grounding, and model-training controls are separate policy decisions. Before changing robots directives for a named AI crawler, verify the provider's current official user-agent/control documentation and decide whether the business wants that specific use.

## Guardrails

- Do not block Googlebot while attempting to control AI training.
- Do not add guessed crawler names.
- Do not claim `llms.txt` is required by Google Search.
- Keep high-value public information accessible to normal search crawlers unless the owner chooses a different policy.
- Keep admin/API/referral mechanics excluded from indexing.
