function parseFeatureFlag(value: string | undefined, productionDefault = false): boolean {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return import.meta.env.PROD ? productionDefault : false;
}

export const features = {
  get searchEnabled() {
    // Production Search is backed by the persisted USPTO corpus in Supabase/Postgres.
    return parseFeatureFlag(import.meta.env.VITE_SEARCH_ENABLED, true);
  },
  get officeActionSearchEnabled() {
    // Production Office Action research queries the persisted corpus only.
    return parseFeatureFlag(import.meta.env.VITE_OFFICE_ACTION_SEARCH_ENABLED, true);
  },
  get watchEnabled() {
    // Runtime capability checks remain authoritative; production defaults to the
    // full Watch interface now that the worker is enabled server-side.
    return parseFeatureFlag(import.meta.env.VITE_WATCH_ENABLED, true);
  },
  get pdfExportEnabled() {
    // Reports are generated server-side by the authenticated PDF export pipeline.
    return parseFeatureFlag(import.meta.env.VITE_PDF_EXPORT_ENABLED, true);
  },
};
