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

The verified editable ERD is [backend-schema-erd.mmd](assets/backend-schema-erd.mmd)
with rendered [SVG](assets/backend-schema-erd.svg). It includes only tables
created by migrations 001–012. The diagram is accessible as text: firms own
users and tenant records; portfolio marks connect to watches, immutable risk
scores, alerts and attributed Office Action references; users request immutable
search snapshots and exports; audit logs are append-only; registry trademarks
retain source registry/reference provenance.

## 2. PostgreSQL Tables (System of Record)

### Migration reconciliation (BE-17)

`backend/migrations/` is executed lexically through `001`–`009`; there are no
duplicate numeric prefixes. The foreign-key sequence is ordered as follows:
firms/users (`001`) precede registry data (`002`), invitations (`003`), identity
linking (`004`–`005`), portfolio marks (`006`), watches (`007`), risk/alerts
(`008`), and audit logs (`009`). Migrations `006`–`009` use additive,
repeat-safe DDL and no migration deletes data. Migrations `004` and `005` are
historical non-destructive `ALTER TABLE` compatibility steps rather than new
table creation.

No database was contacted during the BE-17 exit check. In the absence of
external migration-run evidence, `006_create_portfolio_marks.sql` through
`009_create_audit_logs.sql` must be treated as unapplied. Apply them only
through the controlled deployment migration process; this document does not
claim a local, staging, or production schema state.

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

### `search_results` (immutable historical search snapshot)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | one completed search execution; this is the public `searchId` |
| firm_id | uuid FK → firms, non-null | mandatory tenant boundary |
| requested_by_user_id | uuid FK → users, non-null | resolved from the authenticated Supabase subject during insert |
| request_id | varchar(128), non-null | bounded request-context execution ID; unique per firm for retry idempotency |
| query_snapshot | jsonb object, non-null | exact normalized public query (`mark`, jurisdictions, classes, status, owner, dates) |
| results_snapshot | jsonb array, non-null | ordered normalized public results and complete risk evidence; no raw Elasticsearch response/relevance score |
| source_statuses | jsonb array, non-null | ordered complete/unavailable source statuses |
| partial | boolean, non-null | source degradation state at execution time |
| result_count | integer, non-null | non-negative and validated against the stored results array before insert |
| methodology_versions | jsonb array, non-null | distinct risk methodology versions in deterministic first-result order |
| created_at | timestamptz, non-null | UTC execution snapshot time |

Migration `011_create_search_results.sql` adds this append-only table, tenant
and requester foreign keys, JSON top-level checks, request uniqueness, lookup
indexes, and a trigger rejecting all update/delete operations. The repository
exposes insert/read methods only. It was **not applied** by BE-19. Retention or
expiry cleanup is an operational/legal policy and requires a separately
authorized administrative process; no hard-delete endpoint exists.

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
| firm_id | uuid FK → firms, non-null | tenant boundary |
| portfolio_mark_id | uuid | composite firm-scoped FK → portfolio_marks |
| source_registry | varchar(100) | normalized attributed registry |
| source_reference_id | varchar(200) | non-empty genuine registry document reference; never an internal UUID substitute |
| application_number | varchar(100), nullable | source-provided application number only |
| document_type | varchar(80) | closed BE-18 document-type vocabulary |
| office_action_date | date, nullable | source document date |
| examiner_name | varchar(200), nullable | source-provided only; never invented |
| examiner_reasoning_summary | varchar(4000), nullable | bounded plain-text research summary, not legal advice or an examiner quotation unless `summary_method=registry` says it is source-provided |
| summary_method | varchar(20) | `registry`, `manual`, or `extracted` attribution |
| source_document_url | varchar(2048), nullable | credential/query/fragment-free HTTP(S) attribution URL only |
| source_metadata | jsonb, non-null | bounded allow-listed object; no raw document/payload |
| linked_by_user_id | uuid FK → users, non-null | authenticated linker |
| created_at / updated_at | timestamptz | UTC timestamps |

Migration `010_create_office_action_refs.sql` adds this table, its firm/portfolio
composite key, source provenance uniqueness, object-only metadata constraint,
lookup indexes, and the three Office Action audit actions/entity type. It is
additive/repeat-safe and was **not applied** by BE-18.

### Billing (migration 015)

Subscription projection is stored on `firms`: `subscription_tier`,
`subscription_status`, `subscription_provider`, provider subscription/customer
codes, and `subscription_renews_at`. `billing_transactions` retains only
firm-scoped provider references, the server-selected tier/plan/amount/currency,
status, initiating user, and payment timestamps. `billing_webhook_events`
retains a SHA-256 payload digest, bounded event name/reference, and processing
timestamps for idempotency. It does not retain webhook payloads or payment
credentials. Both new tables are deny-by-default behind RLS and grant no browser
role direct access.

### `audit_logs`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| firm_id | uuid FK → firms, non-null | immutable tenant boundary |
| actor_user_id | uuid FK → users, non-null | resolved from verified Supabase subject during scoped insert |
| action | varchar(80) | constrained frozen BE-16 action taxonomy |
| entity_type | varchar(40) | constrained `portfolio_mark` / `watch` / `alert` / `user` / `export` / `office_action_ref` / `search_result` |
| entity_id | uuid, nullable | genuine mutated resource/job ID; never fabricated |
| before_state | jsonb, nullable | sanitized JSON object only |
| after_state | jsonb, nullable | sanitized JSON object only |
| metadata | jsonb, non-null | sanitized JSON object, default `{}` |
| request_id | varchar(128), nullable | valid request trace ID only |
| ip_address | varchar(64), nullable | normalized trusted client address only |
| user_agent | varchar(512), nullable | bounded user agent only |
| occurred_at | timestamptz, non-null | UTC action time |
| created_at | timestamptz, non-null | UTC insert time |

Migration `009_create_audit_logs.sql` adds the table and is intentionally
repeatable (`IF NOT EXISTS` indexes, guarded constraints, and a replaced
append-only trigger). The trigger rejects all update/delete attempts, and no
application repository operation updates or deletes audit rows. Constraints
require a supported action and entity type, object-only JSON values, and at
least a before state, after state, or non-empty metadata. The list indexes are
`(firm_id, occurred_at DESC, id DESC)`, actor/time, entity/time, action/time,
and non-null request ID. The migration was not applied by BE-16.

The supported actions are portfolio mark create/update/delete; watch
create/update/delete/enable/disable; alert read/dismiss; role change; and export
requested/completed/failed. No alert reopen action exists because the current
alert state machine does not support reopening.

Snapshots and metadata are copied through the bounded recursive sanitizer:
case-insensitive credentials/tokens/headers/secrets become `[REDACTED]`,
pollution keys are dropped, and circular/non-JSON/deep/oversized data is
rejected. The sanitizer preserves genuine registry references. `audit_logs` is
firm-isolated at every write/read query; retention and archival are operational
decisions because this table has no deletion path.

### `exports`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | Server-generated export ID |
| firm_id | uuid FK → firms | Mandatory tenant boundary |
| requested_by_user_id | uuid FK → users | Resolved from authenticated requester |
| export_type | varchar(40) | `search_results`, `risk_report`, or `portfolio_summary` only |
| status | varchar(20) | `queued`, `processing`, `completed`, or `failed` only |
| source_entity_id | uuid | Persisted search snapshot or firm portfolio-mark source |
| request_id / idempotency_key | varchar(128) | Bounded trace/retry identity; unique by `(firm_id, idempotency_key)` |
| parameters | jsonb | Bounded object-only type-specific parameters |
| storage_key | varchar(512), nullable | Private server-only key; never returned by API |
| mime_type / byte_size / checksum_sha256 | nullable | Required together for completed `application/pdf` output |
| failure_code | varchar(100), nullable | Stable bounded code, required for failed state only |
| queued_at / processing_started_at / completed_at / failed_at | timestamptz | UTC lifecycle evidence |
| created_at / updated_at | timestamptz | UTC timestamps |

Migration `012_create_exports.sql` is additive/repeat-safe and **was not
applied**. It supplies firm/requester foreign keys, type/status/object/size/
checksum/failure-code checks, idempotency uniqueness, state-consistency checks,
and indexes for firm/status/time, requester/time, and source lookup. It never
stores PDF bytes or signed URLs. Unlike immutable audit/search snapshots,
exports are intentionally mutable only through the server's legal lifecycle
transitions; there is no API delete route. Retention and any authorized storage
cleanup remain operational/legal policy decisions.

## 3. Redis Usage

| Key pattern | Purpose | TTL |
|---|---|---|
| `session:{token}` | Auth session | sliding, matches refresh-token lifetime |
| `ratelimit:{ip or user}` | Auth/brute-force protection (TRD §3.3) | rolling window |
| `search:cache:{query_hash}` | Federated search result cache | short (minutes) — balances freshness vs. registry load |
| `queue:watch_ingest` | Job queue for scheduled watch/registry polling | n/a (queue, not cache) |
| `queue:pdf_export` | Feature-gated PDF export job queue | n/a (queue, not cache) |

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
