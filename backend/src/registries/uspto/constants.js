export const USPTO_REGISTRY = 'USPTO';
export const USPTO_BULK_SOURCE_NAME = 'USPTO Bulk XML';
export const USPTO_ODP_BULK_SOURCE_NAME = 'USPTO Open Data Portal Bulk XML';
export const USPTO_TSDR_SOURCE_NAME = 'USPTO TSDR';

// Legacy listing/mirror support is retained for controlled fallback only.
export const DEFAULT_USPTO_BULK_LISTING_URL = 'https://trademarks.reedtech.com/tmappxml.php';

// Official USPTO Open Data Portal bulk-data API. Product short names map to
// Trademark Application XML annual snapshots and daily transaction files.
export const DEFAULT_USPTO_ODP_API_BASE_URL = 'https://api.uspto.gov/api/v1/datasets/products';
export const DEFAULT_USPTO_ODP_ANNUAL_PRODUCT = 'TRTYRAP';
export const DEFAULT_USPTO_ODP_DAILY_PRODUCT = 'TRTDXFAP';

export const DEFAULT_USPTO_TSDR_BASE_URL = 'https://tsdrapi.uspto.gov';
