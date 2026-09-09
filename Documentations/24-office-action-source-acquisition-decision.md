# IPRP — USPTO TSDR Source Acquisition & Normalization Decision

**Ticket:** `OA-SOURCE-01A`  
**Date:** September 9, 2026  
**Repository:** `Adeoye100/INTELLECTUAL-PROPERTY-RESEARCH-PLATFORM`  
**Starting Commit:** `efd9d915de4ce18afce0b886bb4c3d6b77e393d1`  
**Status:** `OA SOURCE DISCOVERY BLOCKED — AUTHORIZED CASE SEED SET REQUIRED`  

---

## 1. Executive Summary & Decision Matrix

This document defines the corrected technical design, source contract, API host contract, rate limits, capacity recalculations, and case-discovery prerequisites for producing a production trademark Office Action corpus from the official **USPTO TSDR API**.

### Key Architectural Findings & Corrections:
1. **API Host Contract:** Corrected production origin to `https://tsdrapi.uspto.gov` with resource routes under `/ts/cd/...`.
2. **Current Rate Limits:** Corrected limits from outdated guide values to live USPTO documentation:
   - General API Requests (XML status & document listings): **60 requests per minute**.
   - PDF / ZIP Document Downloads: **4 requests per minute**.
3. **Case Discovery Prerequisite (Critical Gap):** TSDR API does NOT provide a global endpoint to enumerate recent trademark cases or Office Actions. Endpoints require explicit serial numbers (`sn{serialNumber}`).
4. **No Brute-Force Probing:** Guessing sequential serial numbers or brute-force range scanning is strictly forbidden.
5. **No Dependent Search Seeding:** Unattended Search activation is currently blocked (`SEARCH_ENABLED=false`); Office Actions cannot depend on an unavailable Search engine.
6. **Verdict:** `OA SOURCE DISCOVERY BLOCKED — AUTHORIZED CASE SEED SET REQUIRED`.

---

## 2. Official USPTO TSDR API Contract

| Parameter / Feature | Official USPTO Specification |
| :--- | :--- |
| **Official Host Origin** | `https://tsdrapi.uspto.gov` |
| **Authentication** | Header: `USPTO-API-KEY: <secret>` |
| **General Request Rate Limit** | **60 requests per API key per minute** |
| **PDF / ZIP Download Rate Limit** | **4 requests per API key per minute** |
| **Multi-case PDF Rate Limit** | **4 requests per API key per minute** |
| **Documentation Source** | Official USPTO TSDR API Developer Portal & Live FAQ |

---

## 3. Official Endpoints Contract

TSDR programmatic operations require specific, documented routes:

### A. Case Status Endpoint (General Rate: 60 req/min)
- **HTTP Method:** `GET`
- **URL Structure:** `https://tsdrapi.uspto.gov/ts/cd/casestatus/sn{serialNumber}/info.xml`
- **Response Format:** XML
- **Returned Data:** Serial Number, Mark Text, Applicant/Owner Name, Examining Attorney, Status Code, Status Date.

### B. Case Document Metadata Endpoint (General Rate: 60 req/min)
- **HTTP Method:** `GET`
- **URL Structure:** `https://tsdrapi.uspto.gov/ts/cd/casedocs/sn{serialNumber}/info.xml`
- **Response Format:** XML
- **Returned Data:** Document List, Document Type/Title, Issue Date, Document ID (`documentId`), Sequence Number.

### C. Individual Document PDF Endpoint (PDF Rate: 4 req/min)
- **HTTP Method:** `GET`
- **URL Structure:** `https://tsdrapi.uspto.gov/ts/cd/casedocs/sn{serialNumber}/{documentId}.pdf`
- **Response Format:** Binary PDF
- **Policy:** Restricted to strictly necessary downloads due to the 4 downloads/minute rate cap.

---

## 4. Case Discovery & Seed Set Prerequisite

### The Discovery Problem
TSDR APIs require a known trademark serial number (`sn{serialNumber}`) for all request routes. There is no global TSDR endpoint providing a list of recently issued Office Actions across all trademark cases.

### Seed Set Rules:
- **No Brute-Force Probing:** Guessing sequential numbers (e.g., `88000001` through `88999999`) is strictly prohibited.
- **No Unofficial UI Scraping:** Scraping TSDR web search UI is prohibited.
- **No Search Dependency:** Cannot rely on `SEARCH_ENABLED` search data, as Search activation is currently blocked.
- **Required Seed Set:** An authorized, project-approved list of target trademark serial numbers must be provided as an input manifest to any future acquisition adapter.

---

## 5. Field Evidence & Mapping Matrix

Every field in the normalized schema is mapped against verified source capabilities:

| Normalized Field | Source Nature | Verification / Derivation Rule |
| :--- | :--- | :--- |
| `sourceRegistry` | **STATIC PROJECT VALUE** | Static string `'USPTO'` |
| `sourceReferenceId` | **DERIVED FIELD** | `oa-uspto-{applicationNumber}-{documentId}` (using document ID from `casedocs/.../info.xml`) |
| `applicationNumber` | **VERIFIED SOURCE FIELD** | Serial Number from `casestatus/.../info.xml` |
| `markText` | **VERIFIED SOURCE FIELD** | `MarkText` from `casestatus/.../info.xml` |
| `owner` | **VERIFIED SOURCE FIELD** | `ApplicantName` from `casestatus/.../info.xml` |
| `jurisdiction` | **STATIC PROJECT VALUE** | Static string `'US'` |
| `documentType` | **DERIVED FIELD** | Mapped from document title/code in `casedocs/.../info.xml` |
| `officeActionDate` | **VERIFIED SOURCE FIELD** | Document issue date (`YYYY-MM-DD`) from `casedocs/.../info.xml` |
| `examinerName` | **VERIFIED SOURCE FIELD** | Examining Attorney from `casestatus/.../info.xml` |
| `examinerReasoningText` | **UNAVAILABLE / NULL** | Default `null`; plain text only if structured metadata provides it |
| `summaryMethod` | **STATIC PROJECT VALUE** | Static string `'registry'` |
| `sourceDocumentUrl` | **UNAVAILABLE / NULL** | Stored as `null` (immutable identity retained in `sourceMetadata`) |
| `sourceMetadata` | **DERIVED FIELD** | Safe JSON (`{ documentTitle, documentId, sequenceNumber }`) |
| `sourcePublishedAt` | **VERIFIED SOURCE FIELD** | Document issue timestamp |
| `sourceUpdatedAt` | **VERIFIED SOURCE FIELD** | Case update timestamp |

---

## 6. Recalculated Acquisition Capacity & Budget

### Per-Case Request Budget
- 1 General Status Request (`casestatus/.../info.xml`)
- 1 General Document List Request (`casedocs/.../info.xml`)
- **Total per case:** 2 General Requests

### Baseline Estimate (10,000 Cases):
- **General Requests:** `20,000 requests`
- **Rate Limit:** 60 general requests/minute
- **Theoretical Minimum Acquisition Time:** `20,000 / 60 = 333.3 minutes` (**~5.55 hours**)
- **Safe Operational Time (with 20% margin for 429/backoff):** **~6.6 hours**

### PDF Download Impact:
- If 10,000 PDF document bodies were fetched at the 4 downloads/minute rate limit:
  - `10,000 / 4 = 2,500 minutes` (**~41.67 hours**)
  - This 41.7-hour requirement validates the **metadata-first acquisition** policy and storing `examinerReasoningText = null` by default.

---

## 7. HTTP 429 & Security Handling

- **Secret Handling:** `USPTO_TSDR_API_KEY` managed server-side only. Never logged, committed, or exposed to frontend.
- **Host Restriction:** Requests strictly restricted to origin `https://tsdrapi.uspto.gov`.
- **Rate Limit Policy:** Honor `HTTP 429 Too Many Requests` and `Retry-After` headers using exponential backoff with full jitter. Never increase concurrency on rate errors.

---

## 8. Feature Gate Status

- `OFFICE_ACTION_SEARCH_ENABLED`: `false` (fail-closed)
- `VITE_OFFICE_ACTION_SEARCH_ENABLED`: `false` (fail-closed)

---

## 9. Verdict & Required Action

### Verdict: `OA SOURCE DISCOVERY BLOCKED — AUTHORIZED CASE SEED SET REQUIRED`

**Required Next Step:**  
Define an authorized seed set of trademark serial numbers (or an approved global serial discovery manifest) before an upstream TSDR acquisition adapter can be approved for implementation.
