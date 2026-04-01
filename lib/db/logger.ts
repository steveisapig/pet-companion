/** Debug logger for database queries. Only logs when __DEV__ is true. */
function dbLog(
  operation: string,
  table: string,
  details: {
    query?: string;
    params?: unknown;
    result?: unknown;
    error?: unknown;
    /** Human-readable description of what was queried or inserted */
    message?: string;
  }
): void {
  if (!__DEV__) return;
  const msg = `[DB] ${operation} ${table}`;
  const { message, result, ...rest } = details;
  let output = message ? `${msg} — ${message}` : msg;
  if (!details.error && result !== undefined) {
    const resultStr = typeof result === 'object' && result !== null
      ? JSON.stringify(result)
      : String(result);
    output += ` | result: ${resultStr}`;
  }
  if (details.error) {
    console.warn(output, rest);
  } else {
    console.log(output, rest);
  }
}

export { dbLog };
