import { describe, it, expect } from 'vitest'
import { sanitizeIntakeFilters } from './sanitize-intake'

describe('sanitizeIntakeFilters', () => {
  it('returns empty object for null input', () => {
    expect(sanitizeIntakeFilters(null)).toEqual({})
  })

  it('returns empty object for non-object input', () => {
    expect(sanitizeIntakeFilters('string')).toEqual({})
    expect(sanitizeIntakeFilters(42)).toEqual({})
    expect(sanitizeIntakeFilters(undefined)).toEqual({})
  })

  it('returns empty object for empty object', () => {
    expect(sanitizeIntakeFilters({})).toEqual({})
  })

  it('returns empty object when all fields are null', () => {
    expect(sanitizeIntakeFilters({
      conversionType: null,
      rampType: null,
      hasLift: null,
      handControls: null,
      condition: null,
      priceMax: null,
      state: null,
    })).toEqual({})
  })

  describe('conversionType', () => {
    it('accepts rear_entry', () => {
      expect(sanitizeIntakeFilters({ conversionType: 'rear_entry' })).toEqual({
        conversionType: 'rear_entry',
      })
    })

    it('accepts side_entry', () => {
      expect(sanitizeIntakeFilters({ conversionType: 'side_entry' })).toEqual({
        conversionType: 'side_entry',
      })
    })

    it('rejects unknown conversionType values', () => {
      expect(sanitizeIntakeFilters({ conversionType: 'top_entry' })).toEqual({})
      expect(sanitizeIntakeFilters({ conversionType: 'unknown' })).toEqual({})
      expect(sanitizeIntakeFilters({ conversionType: '' })).toEqual({})
    })
  })

  describe('rampType', () => {
    it('accepts in_floor', () => {
      expect(sanitizeIntakeFilters({ rampType: 'in_floor' })).toEqual({ rampType: 'in_floor' })
    })

    it('accepts fold_out', () => {
      expect(sanitizeIntakeFilters({ rampType: 'fold_out' })).toEqual({ rampType: 'fold_out' })
    })

    it('accepts fold_in', () => {
      expect(sanitizeIntakeFilters({ rampType: 'fold_in' })).toEqual({ rampType: 'fold_in' })
    })

    it('rejects unknown rampType values', () => {
      expect(sanitizeIntakeFilters({ rampType: 'none' })).toEqual({})
      expect(sanitizeIntakeFilters({ rampType: 'unknown' })).toEqual({})
    })
  })

  describe('boolean flags', () => {
    it('sets hasLift only when explicitly true', () => {
      expect(sanitizeIntakeFilters({ hasLift: true })).toEqual({ hasLift: true })
      expect(sanitizeIntakeFilters({ hasLift: false })).toEqual({})
      expect(sanitizeIntakeFilters({ hasLift: 1 })).toEqual({})
      expect(sanitizeIntakeFilters({ hasLift: 'true' })).toEqual({})
    })

    it('sets handControls only when explicitly true', () => {
      expect(sanitizeIntakeFilters({ handControls: true })).toEqual({ handControls: true })
      expect(sanitizeIntakeFilters({ handControls: false })).toEqual({})
    })
  })

  describe('condition', () => {
    it('accepts new', () => {
      expect(sanitizeIntakeFilters({ condition: 'new' })).toEqual({ condition: 'new' })
    })

    it('accepts used', () => {
      expect(sanitizeIntakeFilters({ condition: 'used' })).toEqual({ condition: 'used' })
    })

    it('accepts certified_pre_owned', () => {
      expect(sanitizeIntakeFilters({ condition: 'certified_pre_owned' })).toEqual({
        condition: 'certified_pre_owned',
      })
    })

    it('rejects unknown condition values', () => {
      expect(sanitizeIntakeFilters({ condition: 'CPO' })).toEqual({})
      expect(sanitizeIntakeFilters({ condition: 'refurbished' })).toEqual({})
    })
  })

  describe('priceMax', () => {
    it('accepts positive integer', () => {
      expect(sanitizeIntakeFilters({ priceMax: 40000 })).toEqual({ priceMax: 40000 })
    })

    it('rounds floating-point values', () => {
      expect(sanitizeIntakeFilters({ priceMax: 39999.99 })).toEqual({ priceMax: 40000 })
    })

    it('rejects zero', () => {
      expect(sanitizeIntakeFilters({ priceMax: 0 })).toEqual({})
    })

    it('rejects negative values', () => {
      expect(sanitizeIntakeFilters({ priceMax: -1000 })).toEqual({})
    })

    it('rejects non-finite values', () => {
      expect(sanitizeIntakeFilters({ priceMax: Infinity })).toEqual({})
      expect(sanitizeIntakeFilters({ priceMax: NaN })).toEqual({})
    })

    it('rejects string values', () => {
      expect(sanitizeIntakeFilters({ priceMax: '40000' })).toEqual({})
    })
  })

  describe('state', () => {
    it('accepts valid two-letter state codes', () => {
      expect(sanitizeIntakeFilters({ state: 'TX' })).toEqual({ state: 'TX' })
      expect(sanitizeIntakeFilters({ state: 'CA' })).toEqual({ state: 'CA' })
      expect(sanitizeIntakeFilters({ state: 'DC' })).toEqual({ state: 'DC' })
    })

    it('normalizes lowercase to uppercase', () => {
      expect(sanitizeIntakeFilters({ state: 'tx' })).toEqual({ state: 'TX' })
      expect(sanitizeIntakeFilters({ state: 'fl' })).toEqual({ state: 'FL' })
    })

    it('rejects invalid state codes', () => {
      expect(sanitizeIntakeFilters({ state: 'ZZ' })).toEqual({})
      expect(sanitizeIntakeFilters({ state: 'Texas' })).toEqual({})
      expect(sanitizeIntakeFilters({ state: '' })).toEqual({})
    })

    it('rejects non-string state', () => {
      expect(sanitizeIntakeFilters({ state: 42 })).toEqual({})
    })
  })

  it('combines multiple valid fields', () => {
    expect(
      sanitizeIntakeFilters({
        conversionType: 'rear_entry',
        rampType: 'in_floor',
        hasLift: false,
        handControls: true,
        condition: 'used',
        priceMax: 35000,
        state: 'FL',
      }),
    ).toEqual({
      conversionType: 'rear_entry',
      rampType: 'in_floor',
      handControls: true,
      condition: 'used',
      priceMax: 35000,
      state: 'FL',
    })
  })

  it('silently drops extra unknown keys', () => {
    expect(
      sanitizeIntakeFilters({
        conversionType: 'rear_entry',
        injectedField: 'DROP_ME',
        __proto__: 'malicious',
      }),
    ).toEqual({ conversionType: 'rear_entry' })
  })
})
