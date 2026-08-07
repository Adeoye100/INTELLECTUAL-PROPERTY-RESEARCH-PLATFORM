const REGISTERED_CODES = new Set([
  '624', '700', '701', '702', '703', '704', '705', '706', '707', '708',
  '717', '739', '800', '801', '802', '803', '804', '805', '806', '807',
  '808', '809', '810', '811', '812', '813',
]);

const CANCELLED_CODES = new Set([
  '400', '401', '403', '404', '405', '406', '413', '414', '415', '417',
  '626', '709', '710', '711', '712', '713', '714', '900',
]);

const ABANDONED_CODES = new Set([
  '402', '411', '412', '416', '600', '601', '602', '603', '604', '605',
  '606', '607', '608', '609', '614', '618', '622',
]);

/**
 * Collapse the USPTO's granular status codes to the platform's search-level
 * status. The raw USPTO code is retained separately for lossless attribution.
 */
export function normalizeUsptoStatus({ statusCode, abandonmentDate, cancellationDate }) {
  if (cancellationDate || CANCELLED_CODES.has(statusCode)) return 'cancelled';
  if (abandonmentDate || ABANDONED_CODES.has(statusCode)) return 'abandoned';
  if (REGISTERED_CODES.has(statusCode)) return 'registered';
  return 'pending';
}
