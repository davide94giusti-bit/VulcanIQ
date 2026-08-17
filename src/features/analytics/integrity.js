export const CURRENT_TRACKING_ACTIVATION_ISO = '2026-08-17T00:00:00.000Z';
export const CURRENT_TRACKING_ACTIVATION_MS = Date.parse(CURRENT_TRACKING_ACTIVATION_ISO);
export const SMALL_SAMPLE_VISITOR_THRESHOLD = 100;

export function recordTime(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : 0;
}

export function isCurrentTrackingRecord(row) {
  const time = recordTime(row?.created_at || row?.occurred_at);
  return time >= CURRENT_TRACKING_ACTIVATION_MS;
}

export function splitCurrentAndHistorical(rows = []) {
  return rows.reduce((result, row) => {
    result[isCurrentTrackingRecord(row) ? 'current' : 'historical'].push(row);
    return result;
  }, { current: [], historical: [] });
}
