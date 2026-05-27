import { describe, it, expect } from 'vitest'
import { priceBucket, mileageBucket } from './listing-search.js'

describe('priceBucket', () => {
  it('returns null for null price', () => {
    expect(priceBucket(null)).toBeNull()
  })

  it('puts 0 cents in the 0-5000 bucket', () => {
    expect(priceBucket(0)).toBe('0-5000')
  })

  it('puts $4 999.99 in the 0-5000 bucket', () => {
    expect(priceBucket(499999)).toBe('0-5000')
  })

  it('puts exactly $5 000 in the 5000-10000 bucket', () => {
    expect(priceBucket(500000)).toBe('5000-10000')
  })

  it('puts $27 500 in the 25000-30000 bucket', () => {
    expect(priceBucket(2750000)).toBe('25000-30000')
  })

  it('respects a custom bucket size', () => {
    expect(priceBucket(1000000, 10000)).toBe('10000-20000')
  })
})

describe('mileageBucket', () => {
  it('returns null for null mileage', () => {
    expect(mileageBucket(null)).toBeNull()
  })

  it('puts 0 miles in the 0-25000 bucket', () => {
    expect(mileageBucket(0)).toBe('0-25000')
  })

  it('puts 24 999 miles in the 0-25000 bucket', () => {
    expect(mileageBucket(24999)).toBe('0-25000')
  })

  it('puts exactly 25 000 miles in the 25000-50000 bucket', () => {
    expect(mileageBucket(25000)).toBe('25000-50000')
  })

  it('puts 87 000 miles in the 75000-100000 bucket', () => {
    expect(mileageBucket(87000)).toBe('75000-100000')
  })
})
