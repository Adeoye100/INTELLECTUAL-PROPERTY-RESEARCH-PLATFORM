# Backend Schema
## Intellectual Property Research Platform

| | |
|---|---|
| **Version** | 1.0 |
| **Date** | July 30, 2026 |
| **Companion doc** | 02-technical-requirements-document.md |

Three data stores, three jobs: PostgreSQL is the system of record, Redis is the fast/ephemeral layer, Elasticsearch is the search/similarity engine. Nothing lives in two places as a source of truth — Elasticsearch documents are derived from Postgres, never the other way around.

---

## 1. Entity-Relationship Overview

```mermaid
erDiagram
    FIRMS ||--o{ USERS : employs
    FIRMS ||--o{ SUBSCRIPTIONS : has
    USERS ||--o{ SEARCHES : runs
    USERS ||--o{ PORTFOLIO_MARKS : manages
    PORTFOLIO_MARKS ||--o{ WATCHES : monitored_by
    WATCHES ||--o{ ALERTS : generates
    SEARCHES ||--o{ SEARCH_RESULTS : returns
    SEARCH_RESULTS ||--o{ RISK_SCORES : scored_by
    PORTFOLIO_MARKS ||--o{ OFFICE_ACTION_REFS : cites
    USERS ||--o{ AUDIT_LOGS : triggers
```

## 2. PostgreSQL Tables (System of Record)

### `firms`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | |
| subscription_tier | text | |
| created_at | timestamptz | |

### `users`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| supabase_user_id | uuid, unique, nullable | canonical link to the verified Supabase Auth user during migration; no cross-database FK |
| firm_id | uuid FK → firms | |
| email | text, unique | |
| password_hash | text, nullable | legacy local credential only; new Supabase-managed identities leave it null pending column removal |
| role | enum('admin','attorney','viewer') | enforced at API layer per TRD §3.3 |
| created_at | timestamptz | |
| last_login_at | timestamptz | |

### `portfolio_marks`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| firm_id | uuid FK | |
| owner_user_id | uuid FK → users, nullable | creating user when a linked local user is available |
| mark_text | varchar(200) | |
| jurisdiction | text | ISO country/region code |
| nice_classes | int[] | Nice Classification classes |
| status | text | pending/filed/registered/abandoned/expired/cancelled |
| filing_date | date, nullable | |
| registration_date | date, nullable | |
| renewal_date | date, nullable | drives deadline flags in UI when specified |
| source_registry | varchar(100) | attribution, per TRD §3.4 |
| registry_reference | varchar(200) | genuine registry registration/application reference |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `watches`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| firm_id | uuid FK → firms | tenant boundary; participates in composite portfolio-mark FK |
| portfolio_mark_id | uuid FK → portfolio_marks | must belong to `firm_id` |
| owner_user_id | uuid FK → users, nullable | creating user when a linked local user is available |
| state | enum-like text | `enabled` or `paused` |
| poll_interval_minutes | integer | 5–43,200 minutes; copied into each watch at creation |
| next_poll_at | timestamptz, nullable | enabled due-watch selector; paused watches set this to null |
| last_polled_at | timestamptz, nullable | |
| last_poll_status | text, nullable | `completed`, `partial`, or `failed` |
| last_error_code | text, nullable | sanitized stable internal code only |
| created_at | timestamptz | |
| updated_at | timestamptz | |

An enabled watch is unique per `(firm_id, portfolio_mark_id)`. BE-12 polling
does not create alerts, subscriptions, or risk-score rows; those remain later
boundaries.

### `alerts`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| firm_id | uuid FK → firms | tenant boundary |
| watch_id | uuid FK → watches | same firm |
| portfolio_mark_id | uuid FK → portfolio_marks | same firm |
| risk_score_id | uuid FK → risk_scores, non-null | exact immutable evidence snapshot; one alert per score |
| severity | text | `medium` or `high` |
| status | text | `unread`, `read`, or `dismissed` |
| policy_version | text | `watch-alert-policy-v1.0.0` |
| created_at | timestamptz | |
| read_at | timestamptz, nullable | set only for `read` status |
| dismissed_at | timestamptz, nullable | set only for `dismissed` status |
| updated_at | timestamptz | |

### `searches`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| query_text | text | |
| filters | jsonb | jurisdiction, class, date range |
| created_at | timestamptz | |

### `search_results` (cached snapshot of what was shown, for audit/export)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| search_id | uuid FK | |
| candidate_mark_text | text | |
| candidate_source | text | |
| candidate_ref | text | external ID in source registry |

### `risk_scores`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| firm_id | uuid FK → firms | tenant boundary |
| watch_id | uuid FK → watches | same firm |
| portfolio_mark_id | uuid FK → portfolio_marks | same firm |
| candidate_source | text | attributed registry source |
| candidate_registry_reference | text | genuine external registry reference; never Elasticsearch ID |
| candidate_mark_text | text | immutable observed candidate text |
| visual_score | numeric | 0–100 |
| phonetic_score | numeric | 0–100 |
| class_overlap_score | numeric | 0–100 |
| composite_score | numeric | 0–100 |
| conceptual_score | numeric, nullable | currently always null |
| composite_rating | text | `low`, `medium`, or `high` |
| methodology_version | text | BE-10 risk methodology version |
| matched_mark_refs | jsonb | immutable complete evidence |
| source_request_id | text | source-search trace identifier |
| source_statuses | jsonb | per-source completion/unavailability trace |
| source_partial | boolean | whether the observed poll was partial |
| observed_at | timestamptz | poll observation time |
| fingerprint | sha256 text | deterministic idempotency key within watch scope |
| created_at | timestamptz | |

Risk scores are immutable watch-poll evidence. The alert policy is separately
versioned and can reference a risk score, but never changes the BE-10 scoring
methodology.

### `office_action_refs`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| portfolio_mark_id | uuid FK | |
| reference_text | text | |
| examiner_reasoning_summary | text | |
| linked_precedent_ref | text | |

### `subscriptions`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| firm_id | uuid FK | |
| seats_licensed | int | |
| billing_provider | text | confirmed in Phase 1 |
| status | text | active/past_due/canceled |
| renewal_date | date | ties to the yearly renewal line in the agreement |

### `audit_logs`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| action | text | e.g. "portfolio.update", "export.generate" |
| target_ref | text | |
| created_at | timestamptz | |

## 3. Redis Usage

| Key pattern | Purpose | TTL |
|---|---|---|
| `session:{token}` | Auth session | sliding, matches refresh-token lifetime |
| `ratelimit:{ip or user}` | Auth/brute-force protection (TRD §3.3) | rolling window |
| `search:cache:{query_hash}` | Federated search result cache | short (minutes) — balances freshness vs. registry load |
| `queue:watch_ingest` | Job queue for scheduled watch/registry polling | n/a (queue, not cache) |

## 4. Elasticsearch Indices

### `trademarks_composite` (federated search index)
```json
{
  "mark_text": "text + phonetic analyzer",
  "owner": "keyword",
  "jurisdiction": "keyword",
  "nice_classes": "integer[]",
  "status": "keyword",
  "filing_date": "date",
  "source_registry": "keyword",
  "similarity_vector": "dense_vector"
}
```
- `mark_text` indexed with both a standard analyzer and a phonetic analyzer to support the fuzzy/phonetic matching required in the TRD
- `similarity_vector` reserved for a semantic/embedding-based similarity pass if the phonetic + edit-distance approach needs a second signal later

### `office_actions`
```json
{
  "reference_text": "text",
  "examiner_reasoning": "text",
  "related_classes": "integer[]",
  "related_marks": "keyword[]"
}
```

## 5. Data Flow Note

Registry ingestion writes to PostgreSQL first (as the attributed, licensed source of truth), then a sync job projects the relevant fields into Elasticsearch for search/matching. This keeps licensing attribution (TRD §3.4) intact even though the search experience is Elasticsearch-driven.
