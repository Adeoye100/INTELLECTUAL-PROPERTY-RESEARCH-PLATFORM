# IPRP — USPTO TSDR Source Acquisition & Normalization Decision

**Ticket:** `OA-SOURCE-01`  
**Date:** September 9, 2026  
**Repository:** `Adeoye100/INTELLECTUAL-PROPERTY-RESEARCH-PLATFORM`  
**Starting Commit:** `1fdf95b121f1d691c11b8d56478c20514089cf53`  
**Status:** `OA SOURCE ACQUISITION DEFINED — SOURCE ADAPTER APPROVAL REQUIRED`  

---

## 1. Executive Summary & Decision Matrix

This document defines the technical design, source contract, security boundary, and acquisition model for populating a production trademark Office Action corpus from the official **USPTO TSDR (Trademark Status & Document Retrieval) API**.

### Key Architectural Findings:
1. **Adapter Claim Correction:** The repository's CLI script (`pnpm ingest:office-actions`) is a **downstream database loader**, NOT an upstream TSDR acquisition/normalization adapter. No TSDR client code exists in the repository.
2. **Source Access Gate:** Programmatic access to USPTO TSDR requires a registered **USPTO API key** (`USPTO-API-KEY` header). Operator credential acquisition is required prior to live dataset polling.
3. **Adapter Approval Requirement:** Fetching, paginating, filtering, and normalizing TSDR document metadata into the required NDJSON contract requires an upstream TSDR acquisition adapter. Building this new adapter requires explicit technical approval before implementation.
4. **Reasoning Policy:** Examiner reasoning must be extracted directly from genuine source text or stored as `null`. AI-generated summaries, OCR guessing, or fabricated text are strictly forbidden.

---

## 2. Official USPTO TSDR Capabilities & Rates

| Metric / Parameter | Official Specification |
| :--- | :--- |
| **Official Provider** | USPTO TSDR (Trademark Status & Document Retrieval) API |
| **Endpoint Base URL** | `https://tsdr.uspto.gov/api/v1/` (or documented REST endpoints) |
| **Authentication** | Request header: `USPTO-API-KEY: <secret>` |
| **Document Retrieval** | Metadata endpoint: `/status/{appNum}` and document endpoint `/documents/{appNum}` |
| **Published Rate Limits** | Bounded requests per minute (e.g. 120 req/min per API key) |
| **Prohibited Methods** | Scraping TSDR web UI, WAF bypass, proxy rotation, headless browser automation |

---

## 3. Existing Repository Assessment

- **Ingestion CLI (`backend/scripts/ingest-office-actions.js`):** Receives local JSON/NDJSON files, validates schema, and writes records to PostgreSQL via `ingestOfficeActionRecords`.
- **Database Engine (`backend/src/office-actions/office-action-ingestion.js`):** Implements atomic PostgreSQL transactions (`BEGIN`/`COMMIT`/`ROLLBACK`) and fail-closed ledger tracking (`office_action_corpus_runs`).
- **TSDR Acquisition Pipeline:** **NOT PRESENT.** No code currently authenticates to TSDR, polls trademark applications, filters Office Action PDFs/XMLs, or formats NDJSON.

---

## 4. Source-to-Normalized Field Mapping Contract

Every production record ingested into `office_action_documents` must conform strictly to the following mapping rules:

| Normalized Field | TSDR Source Field / Construction Rule | Nullable? | Verification Requirement |
| :--- | :--- | :---: | :--- |
| `sourceRegistry` | Static string `'USPTO'` | `NO` | Must be `'USPTO'` |
| `sourceReferenceId` | `oa-uspto-{applicationNumber}-{documentId}` | `NO` | Deterministic, stable across replays |
| `applicationNumber` | `applicationNumber` / Serial Number (8 digits) | `YES` | Must match official USPTO serial |
| `markText` | `markText` / Mark Literal Description | `YES` | Plain text |
| `owner` | `applicantName` / Current Owner Name | `YES` | Normalized string |
| `jurisdiction` | Static string `'US'` | `NO` | Standard 2-letter ISO code |
| `documentType` | Mapped from TSDR document code/title | `NO` | Must match allowed enum |
| `officeActionDate` | `documentDate` / Action Issue Date (`YYYY-MM-DD`) | `YES` | ISO-8601 calendar date |
| `examinerName` | `examinerName` / Examining Attorney | `YES` | Plain text name |
| `examinerReasoningText` | Extracted plain text refusal grounds | `YES` | Plain text only; `null` if unextracted |
| `summaryMethod` | Static string `'registry'` | `NO` | `'registry'` |
| `sourceDocumentUrl` | `documentDownloadUrl` / Stable TSDR URL | `YES` | Credential-free HTTP(S) URL |
| `sourceMetadata` | JSON object (`{ documentTitle, sequenceNumber }`) | `NO` | Safe JSON metadata |
| `sourcePublishedAt` | ISO-8601 timestamp of publication | `YES` | Strict ISO-8601 string |
| `sourceUpdatedAt` | ISO-8601 timestamp of source record update | `YES` | Strict ISO-8601 string |

### Document Type Mapping Table:

| TSDR Document Category / Description | Internal `documentType` Enum |
| :--- | :--- |
| Non-Final Action / Examining Attorney Office Action | `non_final_office_action` |
| Final Refusal / Final Action | `final_office_action` |
| Restriction Requirement / Election | `restriction_requirement` |
| Suspension Letter / Notice of Suspension | `suspension` |
| Other Official Office Action Notice | `office_action` |
| Unrelated Filing (e.g. Specimen, Power of Attorney) | **EXCLUDED** (Do not ingest) |

---

## 5. Deterministic `sourceReferenceId` Design

Production records MUST use a deterministic, reproducible reference identity:
```
sourceReferenceId = "oa-uspto-" + applicationNumber + "-" + documentId
```
- **Stability:** Ensures exact same ID is derived on replay.
- **Uniqueness:** Prevents duplicate document rows across multiple ingestion runs.
- **Prohibited:** Random UUIDs, ingestion timestamps, or array indices are strictly forbidden for production `sourceReferenceId`.

---

## 6. Reasoning Text Extraction Policy

1. **Source Text Only:** `examinerReasoningText` must contain only genuine plain text extracted directly from official USPTO documents.
2. **Default to `null`:** If TSDR provides only a binary PDF without structured text, `examinerReasoningText` must be set to `null`.
3. **Strict Prohibitions:**
   - NO LLM/AI legal summarization or text generation.
   - NO AI inference of refusal grounds.
   - NO OCR guessing or untrusted third-party enrichment.

---

## 7. Acquisition Capacity & Rate-Limit Estimates

Assuming an initial baseline corpus of **10,000 recent USPTO trademark Office Actions**:

- **Target Record Count:** ~10,000 Office Actions
- **Estimated Metadata Requests:** ~10,000 API calls
- **USPTO Published Rate Limit:** 120 requests/minute per key
- **Theoretical Minimum Acquisition Time:** ~83.3 minutes (~1.4 hours)
- **Safe Acquisition Time (with 20% backoff margin):** ~1.75 hours

---

## 8. Security & Data Safety Rules

1. **Credential Handling:** `USPTO_TSDR_API_KEY` must remain strictly server-side (environment variable or secret manager). Never committed, logged, or sent to frontend.
2. **Hostname Allowlist:** Acquisition requests must target only `https://tsdr.uspto.gov`.
3. **No Scraping:** Browser automation (Selenium, Playwright, Puppeteer) is prohibited.
4. **Parameterized Ingestion:** CLI ingestion writes parameterized SQL via dedicated PostgreSQL client.

---

## 9. Feature Gate Status

- `OFFICE_ACTION_SEARCH_ENABLED`: `false` (fail-closed)
- `VITE_OFFICE_ACTION_SEARCH_ENABLED`: `false` (fail-closed)

Feature gates remain set to `false` until an approved TSDR acquisition adapter is implemented, credentials provided, and the full production corpus ingested and verified.

---

## 10. Verdict & Required Action

### Verdict: `OA SOURCE ACQUISITION DEFINED — SOURCE ADAPTER APPROVAL REQUIRED`

**Required Next Step:**  
Approve construction of an upstream `uspto-tsdr-acquisition-adapter` script that connects to official USPTO TSDR API using operator-provided `USPTO_TSDR_API_KEY`, normalizes responses to NDJSON, and feeds the existing `pnpm ingest:office-actions` CLI loader.
