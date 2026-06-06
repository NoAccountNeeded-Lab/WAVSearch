# VehicleStats Data Sources

`VehicleStats` is for source-backed facts only. WAVSearch must not scrape or reproduce commercial reliability scores such as J.D. Power or Consumer Reports scores without legal sign-off, and it must not compute replacement reliability scores from recalls, complaints, listings, or forum posts.

## Field Policy

| Field               | Current source | Population rule                                                                                                                   |
| ------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `avgLifespanMiles`  | None           | Leave `null` until a public source provides a model-specific value and source URL.                                                |
| `reliabilityScore`  | None           | Leave `null`; WAVSearch does not calculate reliability scores.                                                                    |
| `reliabilitySource` | None           | Leave `null` unless `reliabilityScore` is populated from an approved source.                                                      |
| `jdPowerScore`      | None           | Leave `null` unless legal sign-off allows storing and displaying the score with required context.                                 |
| `dataSourceName`    | Seed metadata  | Human-readable source name for any populated stat field.                                                                          |
| `dataSourceUrl`     | Seed metadata  | Public URL users can open to inspect the source.                                                                                  |
| `methodology`       | Seed metadata  | Plain-language explanation of what the source provides. For empty seed records, it states that no score is calculated or scraped. |

## Current Seed Strategy

The seed file intentionally preserves the common WAV make/model rows but sets all stat and score values to `null`. Each row includes methodology text explaining that the record is a placeholder until public, linkable source data is added.

When adding real data:

1. Prefer primary, public sources with stable URLs.
2. Store the source name and exact URL with the values.
3. Present source links in the user-facing API/UI.
4. Do not create a WAVSearch reliability score or transform complaint/recall counts into a score.
5. Document any approved commercial source and its required display context here before populating data.
