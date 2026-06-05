// Ingest pipeline — each queue can run independently, but stages produce input for the next:
//   source-scrape → detail-crawl → detail-extract → geocode → deduplicate
//
// Enrichment queues (not yet wired):
//   dealer-enrich, vehicle-stats-refresh, model-research
export const QUEUES = {
  SOURCE_SCRAPE:         'source-scrape',
  DETAIL_CRAWL:          'detail-crawl',
  DETAIL_EXTRACT:        'detail-extract',
  GEOCODE:               'geocode',
  DEDUPLICATE:           'deduplicate',
  VIN_ENRICH:            'vin-enrich',
  NHTSA_RECALLS:         'nhtsa-recalls',
  NHTSA_COMPLAINTS:      'nhtsa-complaints',
  NHTSA_SAFETY_RATINGS:  'nhtsa-safety-ratings',
  DEALER_ENRICH:         'dealer-enrich',
  VEHICLE_STATS_REFRESH: 'vehicle-stats-refresh',
  MODEL_RESEARCH:        'model-research',
  LISTING_SYNC:          'listing-sync',
  RAWPAGE_CLEANUP:       'rawpage-cleanup',
} as const

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]
