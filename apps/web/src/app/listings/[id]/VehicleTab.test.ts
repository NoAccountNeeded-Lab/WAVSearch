// VehicleTab.tsx is a React component that cannot be imported in a plain Vitest
// environment without jsdom/React setup. The pure derivation logic is tested here
// in isolation, mirroring the pattern used in AIClient.test.ts and IntakeForm.test.ts.

import { describe, expect, it } from 'vitest'
import type { ModelResearch, ModelResearchClaim, VehicleStats } from './types.js'
import { deriveShowVehicleStats, deriveVisibleVehicleStats } from './vehicleTabUtils.js'

// ── Logic extracted from VehicleTab ──────────────────────────────────────────

const RESEARCH_FIELD_ORDER = [
  'engineDescription',
  'drivetrain',
  'fuelEconomyCombined',
  'fuelEconomyCity',
  'fuelEconomyHwy',
  'fuelType',
  'transmission',
]

function deriveResearchClaims(modelResearch: ModelResearch | null): ModelResearchClaim[] {
  return RESEARCH_FIELD_ORDER.flatMap((field) => {
    const claim = modelResearch?.claims.find((c) => c.field === field)
    return claim ? [claim] : []
  })
}

function deriveShowListingFuelType(
  modelResearch: ModelResearch | null,
  listingFuelType: string | null,
): boolean {
  const researchedFields = new Set(deriveResearchClaims(modelResearch).map((c) => c.field))
  return !researchedFields.has('fuelType') && Boolean(listingFuelType)
}

function deriveShowListingTransmission(
  modelResearch: ModelResearch | null,
  listingTransmission: string | null,
): boolean {
  const researchedFields = new Set(deriveResearchClaims(modelResearch).map((c) => c.field))
  return !researchedFields.has('transmission') && Boolean(listingTransmission)
}

// ── fixtures ──────────────────────────────────────────────────────────────────

function makeResearch(claimFields: string[]): ModelResearch {
  return {
    vehicleModel: { id: 'vm-1', make: 'Toyota', model: 'Sienna', year: 2020 },
    researchVersion: 1,
    researchedAt: '2026-06-01T00:00:00.000Z',
    sources: [
      {
        id: 'src-1',
        sourceName: 'EPA FuelEconomy.gov',
        sourceUrl: 'https://example.com',
        fetchedAt: '2026-06-01T00:00:00.000Z',
      },
    ],
    claims: claimFields.map((field, i) => ({
      id: `claim-${i}`,
      field,
      claimText: `${field} value`,
      confidence: 'high',
      sourceId: 'src-1',
    })),
  }
}

function makeVehicleStats(overrides: Partial<VehicleStats> = {}): VehicleStats {
  return {
    make: 'Toyota',
    model: 'Sienna',
    year: null,
    avgLifespanMiles: null,
    reliabilityScore: null,
    reliabilitySource: null,
    jdPowerScore: null,
    methodology: null,
    refreshedAt: '2026-06-01T00:00:00.000Z',
    sources: [],
    ...overrides,
  }
}

// ── deriveResearchClaims ──────────────────────────────────────────────────────

describe('deriveResearchClaims', () => {
  it('returns empty array when modelResearch is null', () => {
    expect(deriveResearchClaims(null)).toEqual([])
  })

  it('returns empty array when research has no claims', () => {
    const research = makeResearch([])
    expect(deriveResearchClaims(research)).toEqual([])
  })

  it('returns claims ordered by RESEARCH_FIELD_ORDER regardless of input order', () => {
    const research = makeResearch(['transmission', 'engineDescription', 'drivetrain'])
    const result = deriveResearchClaims(research)
    expect(result.map((c) => c.field)).toEqual(['engineDescription', 'drivetrain', 'transmission'])
  })

  it('omits fields not present in the claims list', () => {
    const research = makeResearch(['fuelEconomyCombined'])
    const result = deriveResearchClaims(research)
    expect(result).toHaveLength(1)
    expect(result[0]!.field).toBe('fuelEconomyCombined')
  })

  it('picks the first matching claim when duplicates exist for the same field', () => {
    const research: ModelResearch = {
      ...makeResearch([]),
      claims: [
        { id: 'c1', field: 'drivetrain', claimText: 'AWD', confidence: 'high', sourceId: 'src-1' },
        {
          id: 'c2',
          field: 'drivetrain',
          claimText: 'FWD',
          confidence: 'medium',
          sourceId: 'src-1',
        },
      ],
    }
    const result = deriveResearchClaims(research)
    const drivetrainClaims = result.filter((c) => c.field === 'drivetrain')
    expect(drivetrainClaims).toHaveLength(1)
    expect(drivetrainClaims[0]!.claimText).toBe('AWD')
  })

  it('ignores claims for fields not in RESEARCH_FIELD_ORDER', () => {
    const research: ModelResearch = {
      ...makeResearch([]),
      claims: [
        {
          id: 'c1',
          field: 'unknownField',
          claimText: 'some value',
          confidence: 'low',
          sourceId: null,
        },
        { id: 'c2', field: 'drivetrain', claimText: 'AWD', confidence: 'high', sourceId: 'src-1' },
      ],
    }
    const result = deriveResearchClaims(research)
    expect(result.map((c) => c.field)).toEqual(['drivetrain'])
  })
})

// ── deriveShowListingFuelType ─────────────────────────────────────────────────

describe('deriveShowListingFuelType', () => {
  it('returns false when modelResearch is null and listing has no fuelType', () => {
    expect(deriveShowListingFuelType(null, null)).toBe(false)
  })

  it('returns true when modelResearch is null and listing has a fuelType', () => {
    expect(deriveShowListingFuelType(null, 'Gasoline')).toBe(true)
  })

  it('returns false when research already has a fuelType claim', () => {
    const research = makeResearch(['fuelType'])
    expect(deriveShowListingFuelType(research, 'Gasoline')).toBe(false)
  })

  it('returns true when research has no fuelType claim and listing has one', () => {
    const research = makeResearch(['drivetrain'])
    expect(deriveShowListingFuelType(research, 'Diesel')).toBe(true)
  })

  it('returns false when research has no fuelType claim but listing fuelType is null', () => {
    const research = makeResearch(['drivetrain'])
    expect(deriveShowListingFuelType(research, null)).toBe(false)
  })
})

// ── deriveShowListingTransmission ─────────────────────────────────────────────

describe('deriveShowListingTransmission', () => {
  it('returns false when modelResearch is null and listing has no transmission', () => {
    expect(deriveShowListingTransmission(null, null)).toBe(false)
  })

  it('returns true when modelResearch is null and listing has a transmission', () => {
    expect(deriveShowListingTransmission(null, 'Automatic')).toBe(true)
  })

  it('returns false when research already has a transmission claim', () => {
    const research = makeResearch(['transmission'])
    expect(deriveShowListingTransmission(research, 'Automatic')).toBe(false)
  })

  it('returns true when research has no transmission claim and listing has one', () => {
    const research = makeResearch(['fuelType'])
    expect(deriveShowListingTransmission(research, 'Manual')).toBe(true)
  })

  it('returns false when research has no transmission claim but listing transmission is null', () => {
    const research = makeResearch(['fuelType'])
    expect(deriveShowListingTransmission(research, null)).toBe(false)
  })
})

// ── deriveVisibleVehicleStats ────────────────────────────────────────────────

describe('deriveVisibleVehicleStats', () => {
  it('returns empty array when vehicleStats is null', () => {
    expect(deriveVisibleVehicleStats(null)).toEqual([])
  })

  it('does not invent score rows when all stats are null', () => {
    expect(deriveVisibleVehicleStats(makeVehicleStats())).toEqual([])
  })

  it('formats only source-provided stat values', () => {
    expect(
      deriveVisibleVehicleStats(
        makeVehicleStats({ avgLifespanMiles: 200000, reliabilityScore: null, jdPowerScore: 82 }),
      ),
    ).toEqual([
      { label: 'Average lifespan', value: '200,000 miles' },
      { label: 'J.D. Power score', value: '82' },
    ])
  })

  it('includes a Reliability score row when reliabilityScore is non-null', () => {
    expect(
      deriveVisibleVehicleStats(makeVehicleStats({ reliabilityScore: 4.2 })),
    ).toEqual([{ label: 'Reliability score', value: '4.2' }])
  })

  it('formats avgLifespanMiles with locale thousands separator', () => {
    const result = deriveVisibleVehicleStats(makeVehicleStats({ avgLifespanMiles: 300000 }))
    expect(result).toEqual([{ label: 'Average lifespan', value: '300,000 miles' }])
  })
})

// ── deriveShowVehicleStats ───────────────────────────────────────────────────

describe('deriveShowVehicleStats', () => {
  it('returns false when vehicleStats is null', () => {
    expect(deriveShowVehicleStats(null)).toBe(false)
  })

  it('returns false when no stats, methodology, or sources exist', () => {
    expect(deriveShowVehicleStats(makeVehicleStats())).toBe(false)
  })

  it('returns true when at least one visible stat value is present', () => {
    expect(
      deriveShowVehicleStats(makeVehicleStats({ avgLifespanMiles: 200000 })),
    ).toBe(true)
  })

  it('returns true when methodology explains why scores are blank', () => {
    expect(
      deriveShowVehicleStats(
        makeVehicleStats({
          methodology: 'No reliability or lifespan score is populated.',
        }),
      ),
    ).toBe(true)
  })

  it('returns true when linkable sources are present', () => {
    expect(
      deriveShowVehicleStats(
        makeVehicleStats({
          sources: [{ name: 'NHTSA', url: 'https://www.nhtsa.gov/' }],
        }),
      ),
    ).toBe(true)
  })
})
