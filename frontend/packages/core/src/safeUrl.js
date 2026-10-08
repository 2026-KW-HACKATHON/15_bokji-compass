// Browser URL parsing can normalize whitespace and backslashes; reject them first.
export function safeWebUrl(value, { httpsOnly = false } = {}) {
  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    /[\u0000-\u0020\u007f\\]/.test(value) ||
    !/^https?:\/\//i.test(value)
  )
    return null;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || (!httpsOnly && url.protocol === 'http:')) &&
      url.hostname &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
