function isFeatureEnabled(value: string | undefined, defaultValue = true): boolean {
  if (value === undefined || value === '') return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

export const features = {
  get searchEnabled() {
    return isFeatureEnabled(import.meta.env.VITE_SEARCH_ENABLED, true);
  },
  get officeActionSearchEnabled() {
    return isFeatureEnabled(import.meta.env.VITE_OFFICE_ACTION_SEARCH_ENABLED, true);
  },
  get watchEnabled() {
    return isFeatureEnabled(import.meta.env.VITE_WATCH_ENABLED, true);
  },
  get pdfExportEnabled() {
    return isFeatureEnabled(import.meta.env.VITE_PDF_EXPORT_ENABLED, true);
  },
};
