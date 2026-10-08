import { safeWebUrl } from '../../../packages/core/src/safeUrl.js';

function ownSetting(source, key) {
  if (
    !source ||
    typeof source !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(source))
  )
    throw new Error('Invalid configuration object');
  const field = Object.getOwnPropertyDescriptor(source, key);
  if (!field) return undefined;
  if (!Object.hasOwn(field, 'value') || typeof field.value !== 'string')
    throw new Error('Invalid configuration value');
  return field.value;
}

export function resolveConfig(runtime = {}, environment = {}) {
  const mode =
    ownSetting(runtime, 'dataMode') || ownSetting(environment, 'VITE_DATA_MODE') || 'auto';
  if (!['demo', 'api', 'auto'].includes(mode)) throw new Error('dataMode must be api or auto');
  // Legacy demo settings also connect to the API; no synthetic runtime data remains.
  const dataMode = 'api';
  const address =
    ownSetting(runtime, 'apiBaseUrl') || ownSetting(environment, 'VITE_API_BASE_URL') || '/api';
  if (address.length > 2048 || /[\u0000-\u0020\u007f\\?#]/.test(address))
    throw new Error('Invalid API base URL');
  const apiBaseUrl = /^\/(?!\/)/.test(address)
    ? address
    : /^https?:\/\/[^/]/i.test(address)
      ? safeWebUrl(address)
      : null;
  if (!apiBaseUrl) throw new Error('Invalid API base URL');
  return {
    dataMode,
    apiBaseUrl,
    policiesPath: '/v1/policies',
    recommendationsPath: '/v1/recommendations',
  };
}
