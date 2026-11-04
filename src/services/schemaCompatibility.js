export function isMissingColumn(error, allowedColumns = []) {
  if (!['42703', 'PGRST204'].includes(String(error?.code || ''))) return false;
  const message = `${error.message || ''} ${error.details || ''}`;
  return allowedColumns.some((column) => message.includes(column));
}
export function isMissingFunction(error, allowedFunctions = []) {
  if (!['42883', 'PGRST202'].includes(String(error?.code || ''))) return false;
  const message = `${error.message || ''} ${error.details || ''}`;
  return allowedFunctions.some((name) => message.includes(name));
}
