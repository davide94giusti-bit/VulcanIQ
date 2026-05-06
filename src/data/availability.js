// vulcanIQ availability data
// Edit this file to block or limit dates when managing availability in code.
//
// status values:
// - "closed"    = cannot be requested directly
// - "limited"   = limited availability, request still allowed
// - "on-request" = request possible, confirmation depends on conditions
//
// Optional field:
// - experience: use one of "etna-premium", "etna-learning", "etna-live", "etna-stories"
//   If omitted, the date applies globally to every experience.
//
// Date format must be YYYY-MM-DD.
export const blockedDates = [
  {
    date: "2026-02-16",
    status: "closed",
    reason: {
      it: "Non disponibile",
      en: "Closed"
    }
  },
  {
    date: "2026-02-18",
    status: "limited",
    reason: {
      it: "Disponibilita limitata",
      en: "Limited availability"
    }
  },
  {
    date: "2026-02-20",
    experience: "etna-live",
    status: "on-request",
    reason: {
      it: "In base alle condizioni vulcaniche",
      en: "Depending on volcanic conditions"
    }
  }
];

export const defaultExperienceAvailability = {
  "etna-premium": "on-request",
  "etna-learning": "available",
  "etna-live": "on-request",
  "etna-stories": "available"
};
