import { createContext } from 'react';

// Preserve context identity while the provider or a screen is hot-reloaded.
export const I18nContext = createContext(null);
