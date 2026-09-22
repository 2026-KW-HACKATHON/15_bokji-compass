import { resolveConfig } from './configModel.js';
export const appConfig = resolveConfig(
  window.__BOKJI_CONFIG__,
  import.meta.env,
  import.meta.env.DEV,
);
