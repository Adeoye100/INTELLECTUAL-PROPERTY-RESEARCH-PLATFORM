function isFeatureEnabled(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

function productionDefault(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return import.meta.env.PROD ? fallback : false;
  return isFeatureEnabled(value);
}

export const features = {
  get searchEnabled() {
    // Search is now a core production surface. An explicit false still gives
    // operators an emergency rollback without rebuilding application code.
    return productionDefault(import.meta.env.VITE_SEARCH_ENABLED, true);
  },
  get officeActionSearchEnabled() {
    return isFeatureEnabled(
      import.meta.env.VITE_OFFICE_ACTION_SEARCH_ENABLED
    );
  },
  get watchEnabled() {
    // Automated watches share the live Search freshness gate and can still be
    // explicitly disabled at build time for emergency rollback.
    return productionDefault(import.meta.env.VITE_WATCH_ENABLED, true);
  },
  get pdfExportEnabled() {
    return isFeatureEnabled(import.meta.env.VITE_PDF_EXPORT_ENABLED);
  },
};
