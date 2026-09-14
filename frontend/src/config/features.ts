function isFeatureEnabled(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

export const features = {
  get searchEnabled() {
    return isFeatureEnabled(import.meta.env.VITE_SEARCH_ENABLED);
  },
  get officeActionSearchEnabled() {
    return isFeatureEnabled(
      import.meta.env.VITE_OFFICE_ACTION_SEARCH_ENABLED
    );
  },
  get watchEnabled() {
    return isFeatureEnabled(import.meta.env.VITE_WATCH_ENABLED);
  },
  get pdfExportEnabled() {
    return isFeatureEnabled(import.meta.env.VITE_PDF_EXPORT_ENABLED);
  },
};
