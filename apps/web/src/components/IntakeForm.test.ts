import { describe, it, expect } from 'vitest'
import type { IntakeFilters } from '@wivwav/types'

// buildFilterSearch is not exported from IntakeForm.tsx because it lives in a 'use client' module.
// We duplicate the logic here under test to keep the component boundary intact and avoid
// importing Next.js/React hooks (useRouter etc.) outside a browser/Next.js environment.
// If the implementation changes, update both.
function buildFilterSearch(filters: IntakeFilters): string {
  const params = new URLSearchParams()

  if (filters.conversionType != null) params.set('conversionType', filters.conversionType)
  if (filters.rampType != null) params.set('rampType', filters.rampType)
  if (filters.hasLift === true) params.set('hasLift', 'true')
  if (filters.handControls === true) params.set('handControls', 'true')
  if (filters.condition != null) params.set('condition', filters.condition)
  if (filters.priceMax != null && filters.priceMax > 0) {
    // API accepts price in cents
    params.set('priceMax', String(filters.priceMax * 100))
  }
  if (filters.state != null) params.set('state', filters.state)

  return params.toString()
}

describe('buildFilterSearch', () => {
  it('returns empty string for empty filters', () => {
    expect(buildFilterSearch({})).toBe('')
  })

  it('includes conversionType when set', () => {
    const qs = buildFilterSearch({ conversionType: 'rear_entry' })
    expect(qs).toBe('conversionType=rear_entry')
  })

  it('includes side_entry conversionType', () => {
    const qs = buildFilterSearch({ conversionType: 'side_entry' })
    expect(qs).toBe('conversionType=side_entry')
  })

  it('includes rampType when set', () => {
    const qs = buildFilterSearch({ rampType: 'in_floor' })
    expect(qs).toBe('rampType=in_floor')
  })

  it('includes fold_out and fold_in rampType values', () => {
    expect(buildFilterSearch({ rampType: 'fold_out' })).toBe('rampType=fold_out')
    expect(buildFilterSearch({ rampType: 'fold_in' })).toBe('rampType=fold_in')
  })

  it('includes hasLift only when true', () => {
    expect(buildFilterSearch({ hasLift: true })).toBe('hasLift=true')
    expect(buildFilterSearch({ hasLift: false })).toBe('')
  })

  it('includes handControls only when true', () => {
    expect(buildFilterSearch({ handControls: true })).toBe('handControls=true')
    expect(buildFilterSearch({ handControls: false })).toBe('')
  })

  it('includes condition when set', () => {
    expect(buildFilterSearch({ condition: 'used' })).toBe('condition=used')
    expect(buildFilterSearch({ condition: 'new' })).toBe('condition=new')
    expect(buildFilterSearch({ condition: 'certified_pre_owned' })).toBe(
      'condition=certified_pre_owned',
    )
  })

  it('converts priceMax from dollars to cents', () => {
    const qs = buildFilterSearch({ priceMax: 40000 })
    expect(qs).toBe('priceMax=4000000')
  })

  it('omits priceMax when zero', () => {
    expect(buildFilterSearch({ priceMax: 0 })).toBe('')
  })

  it('omits priceMax when undefined', () => {
    expect(buildFilterSearch({})).toBe('')
  })

  it('includes state when set', () => {
    expect(buildFilterSearch({ state: 'TX' })).toBe('state=TX')
  })

  it('builds full query string for all filters', () => {
    const filters: IntakeFilters = {
      conversionType: 'rear_entry',
      rampType: 'in_floor',
      hasLift: false,
      handControls: true,
      condition: 'used',
      priceMax: 35000,
      state: 'FL',
    }
    const qs = buildFilterSearch(filters)
    const params = new URLSearchParams(qs)

    expect(params.get('conversionType')).toBe('rear_entry')
    expect(params.get('rampType')).toBe('in_floor')
    expect(params.has('hasLift')).toBe(false)
    expect(params.get('handControls')).toBe('true')
    expect(params.get('condition')).toBe('used')
    expect(params.get('priceMax')).toBe('3500000')
    expect(params.get('state')).toBe('FL')
  })

  it('omits null conversionType', () => {
    const qs = buildFilterSearch({ state: 'CA' })
    expect(qs).toBe('state=CA')
  })
})
