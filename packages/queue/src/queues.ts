export const QUEUES = {
  SOURCE_SCRAPE:         'source-scrape',
  DETAIL_CRAWL:          'detail-crawl',
  DETAIL_EXTRACT:        'detail-extract',
  GEOCODE:               'geocode',
  DEDUPLICATE:           'deduplicate',
  VIN_ENRICH:            'vin-enrich',
  NHTSA_RECALLS:         'nhtsa-recalls',
  NHTSA_SAFETY_RATINGS:  'nhtsa-safety-ratings',
  DEALER_ENRICH:         'dealer-enrich',
  VEHICLE_STATS_REFRESH: 'vehicle-stats-refresh',
} as const

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]
