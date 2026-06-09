import { describe, it, expect } from 'vitest'
import { MODEL_CATALOG, JOB_RECOMMENDATIONS } from './model-catalog'

describe('MODEL_CATALOG', () => {
  it('is non-empty', () => {
    expect(MODEL_CATALOG.length).toBeGreaterThan(0)
  })

  it('every entry has a non-empty name and label', () => {
    for (const m of MODEL_CATALOG) {
      expect(m.name.length).toBeGreaterThan(0)
      expect(m.label.length).toBeGreaterThan(0)
    }
  })

  it('every entry has a positive paramBillions', () => {
    for (const m of MODEL_CATALOG) {
      expect(m.paramBillions).toBeGreaterThan(0)
    }
  })

  it('every entry has a positive sizeGB', () => {
    for (const m of MODEL_CATALOG) {
      expect(m.sizeGB).toBeGreaterThan(0)
    }
  })

  it('every entry has a non-empty description', () => {
    for (const m of MODEL_CATALOG) {
      expect(m.description.length).toBeGreaterThan(0)
    }
  })

  it('names are unique', () => {
    const names = MODEL_CATALOG.map(m => m.name)
    const unique = new Set(names)
    expect(unique.size).toBe(names.length)
  })
})

describe('JOB_RECOMMENDATIONS', () => {
  const expectedJobs = ['intake', 'scraper.structure', 'scraper.remap', 'agents']

  it('contains all four AI jobs', () => {
    for (const job of expectedJobs) {
      expect(JOB_RECOMMENDATIONS[job]).toBeDefined()
    }
  })

  it('each job has at least one recommended model', () => {
    for (const job of expectedJobs) {
      const recs = JOB_RECOMMENDATIONS[job]
      expect(recs!.length).toBeGreaterThan(0)
    }
  })

  it('every recommended model name appears in MODEL_CATALOG', () => {
    const catalogNames = new Set(MODEL_CATALOG.map(m => m.name))
    for (const [job, recs] of Object.entries(JOB_RECOMMENDATIONS)) {
      for (const rec of recs) {
        expect(catalogNames.has(rec), `Job "${job}" recommends "${rec}" which is not in MODEL_CATALOG`).toBe(true)
      }
    }
  })
})
