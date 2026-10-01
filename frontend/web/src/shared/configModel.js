export function resolveConfig(runtime = {}, environment = {}) {
  const mode = runtime.dataMode || environment.VITE_DATA_MODE || 'auto';
  if (!['demo', 'api', 'auto'].includes(mode)) throw new Error('dataMode must be api or auto');
  // Legacy demo settings also connect to the API; no synthetic runtime data remains.
  const dataMode = 'api';
  const apiBaseUrl = runtime.apiBaseUrl || environment.VITE_API_BASE_URL || '/api';
  if (!/^(\/[^/]|https?:\/\/)/.test(apiBaseUrl) || /[?#]/.test(apiBaseUrl))
    throw new Error('Invalid API base URL');
  return {
    dataMode,
    apiBaseUrl,
    policiesPath: '/v1/policies',
    recommendationsPath: '/v1/recommendations',
  };
}
