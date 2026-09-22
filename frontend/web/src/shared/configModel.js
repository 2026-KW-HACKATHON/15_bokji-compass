export function resolveConfig(runtime = {}, environment = {}, development = false) {
  const mode = runtime.dataMode || environment.VITE_DATA_MODE || 'auto';
  const dataMode = mode === 'auto' ? (development ? 'demo' : 'api') : mode;
  if (!['demo', 'api'].includes(dataMode)) throw new Error('dataMode must be api, demo, or auto');
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
