# Listing page design — WAV Search

**Status:** Design exploration (mockup, not yet implemented)
**Mockup file:** `docs/design/listing-page-mockup.html` — open in any browser

---

## Goal

Replace the standard data-table car listing with a market research page that lets buyers see and explore data rather than just read text. WAV-specific features should be front and center, since they're the primary reason someone is on this site.

---

## Design principles

- **WAV features first.** The conversion details (ramp type, floor lowering, WC capacity, entry type, manufacturer) appear immediately after the hero — before price context, before vehicle details.
- **Visual over tabular.** Mileage gauge, price histogram, and satisfaction bars replace text fields wherever a visual communicates faster.
- **Progressive disclosure.** High-signal sections (WAV features, price, recalls, mileage) are open by default. Research-depth sections (owner satisfaction, dealer reviews) are collapsed — present when wanted, out of the way when not.
- **Alerts stay visible.** Open recall notices show a badge on the section header even when collapsed, so a buyer can't miss them.

---

## Sections & data sources

### Hero card
- Vehicle photo (gallery with dot indicators)
- Condition badge: New / Used / Certified Pre-Owned (from `listing.condition`)
- Days listed (calculated from `listing.listedAt`)
- Price with estimated monthly payment
- Price drop history ("Reduced $X on [date]") — requires price history tracking
- Market velocity: avg days to sell for comparable vehicles — requires market data API
- Save / Share actions

### WAV features *(open by default)*
- Entry type callout: side-entry vs. rear-entry — from `listing.conversionType`
- Feature grid: floor lowering inches, ramp type, WC capacity, transfer seat, hand controls, lift — all from listing fields; dimmed when not included
- Conversion manufacturer row: name, rating, years in business — from `listing.conversionManufacturer`
- Conversion warranty remaining — requires warranty tracking or user input

**Data fields used:** `conversionType`, `conversionManufacturer`, `floorLoweringInches`, `rampType`, `hasLift`, `handControls`, `transferSeat`, `wheelchairCapacity`

### Mileage & lifespan *(open by default)*
- Horizontal gauge: current mileage vs. make/model average lifespan
- Source for avg lifespan: iSeeCars, Consumer Reports, or a static lookup table by make/model
- Green callout: "X% of expected life used"

**Data fields used:** `listing.mileage`, static lifespan table by make/model

### Price vs. market *(open by default)*
- Histogram of comparable WAV listings in the same price range
- "X% below/above avg" callout with the avg price for similar vehicles
- Requires: market pricing API or aggregated listing data from our own index

**Data fields used:** `listing.priceCents`, comparable listings query

### Recalls & VIN history *(open by default — badge shows open count)*
- VIN, owner count, accident history — from CARFAX / AutoCheck API
- NHTSA recall list with open/completed status — from NHTSA recall API (free, public)
  - API: `https://api.nhtsa.gov/recalls/recallsByVehicle?make=Toyota&model=Sienna&modelYear=2023`

**Data fields used:** `listing.vin`, NHTSA API, CARFAX/AutoCheck API

### Owner satisfaction *(collapsed by default)*
- J.D. Power Vehicle Dependability score — static by make/model/year, updated annually
- Conversion manufacturer rating — aggregated from owner reviews, or sourced from manufacturer
- Category bars: reliability, ramp quality, ease of entry, interior space — requires review data with category tagging

### Dealer *(always visible header, reviews collapsed)*
- Name, specialty tag, years in business, rating + review count
- Review summary snippet (auto-generated from top themes)
- Expandable review list with source attribution (Google, DealerRater, etc.)
- Requires: dealer review aggregation (Google Places API, DealerRater scrape, or dealer-submitted data)

**Data fields used:** `listing.dealerName`, `listing.dealerPhone`, review API

### Location *(open by default)*
- Map pin with city/zip
- Delivery availability flag
- Nearby dealer count

**Data fields used:** `listing.city`, `listing.state`, `listing.zip`

### Similar WAVs nearby *(open by default)*
- 2 listings with: name, key specs, days listed, price, location, condition badge
- "See all" triggers a filtered search

---

## Color usage

| Color | Usage |
|---|---|
| `#b85c00` (amber-orange) | Price, CTAs, primary actions, ratings |
| `#166534` / `#dcfce7` (green) | WAV feature badges, positive indicators, lifespan marker |
| `#fff3e8` (amber light) | Warnings, open recalls, conversion info background |
| `#1c1410` (near-black) | Hero background, dark overlay |
| `#fffaf6` (warm off-white) | Page surface |

Green is reserved exclusively for WAV features and positive signals. This creates a consistent visual language: green = accessibility feature.

---

## Open questions / decisions needed

- [ ] What's the source for conversion manufacturer ratings? Aggregated ourselves vs. pulling from a third party?
- [ ] Do we show price drop history? Requires storing price at each scrape, not just current price.
- [ ] Market velocity ("avg 18 days to sell") — do we have enough listing volume to calculate this ourselves?
- [ ] Warranty remaining — do we ask the dealer to input this, or scrape it from listing descriptions?
- [ ] CARFAX vs. AutoCheck vs. building our own VIN history from scrape data?
- [ ] Collapsed-by-default sections — should user preference be remembered across sessions?
