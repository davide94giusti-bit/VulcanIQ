const GOOGLE_STAR_RATINGS = Object.freeze({
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5
});

function cleanString(value, max = 12000) {
  return typeof value === 'string'
    ? value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max)
    : '';
}

function cleanReviewText(value, max = 12000) {
  return typeof value === 'string'
    ? value.trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max)
    : '';
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === '') return Number.NaN;
  return Number(value);
}

export function normalizeGoogleStarRating(value) {
  return GOOGLE_STAR_RATINGS[cleanString(value, 30).toUpperCase()] || null;
}

export function normalizeGoogleBusinessReview(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object') return null;

  const providerReviewId = cleanString(value.reviewId, 240);
  if (!providerReviewId) return null;

  const reviewer = value.reviewer && !Array.isArray(value.reviewer) && typeof value.reviewer === 'object'
    ? value.reviewer
    : {};
  const reply = value.reviewReply && !Array.isArray(value.reviewReply) && typeof value.reviewReply === 'object'
    ? value.reviewReply
    : {};
  const authorIsAnonymous = reviewer.isAnonymous === true;

  return {
    providerReviewId,
    authorDisplayName: authorIsAnonymous ? null : (cleanString(reviewer.displayName, 240) || null),
    authorPhotoUri: authorIsAnonymous ? null : (cleanString(reviewer.profilePhotoUrl, 1000) || null),
    authorIsAnonymous,
    rating: normalizeGoogleStarRating(value.starRating),
    reviewText: cleanReviewText(value.comment, 12000) || null,
    publishedAt: cleanString(value.createTime, 80) || null,
    updatedAtSource: cleanString(value.updateTime, 80) || null,
    providerReplyText: cleanReviewText(reply.comment, 12000) || null,
    providerReplyUpdatedAt: cleanString(reply.updateTime, 80) || null
  };
}

export function normalizeGoogleReviewPage(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error('google_business_malformed_response');
  }
  if (value.reviews !== undefined && !Array.isArray(value.reviews)) {
    throw new Error('google_business_malformed_response');
  }

  const averageRating = optionalNumber(value.averageRating);
  const totalReviewCount = optionalNumber(value.totalReviewCount);

  return {
    reviews: (value.reviews || []).map(normalizeGoogleBusinessReview).filter(Boolean),
    averageRating: Number.isFinite(averageRating) && averageRating >= 1 && averageRating <= 5
      ? averageRating
      : null,
    totalReviewCount: Number.isInteger(totalReviewCount) && totalReviewCount >= 0
      ? totalReviewCount
      : null,
    nextPageToken: cleanString(value.nextPageToken, 2048)
  };
}
