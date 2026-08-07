# USPTO Daily Trademark XML — Verified Adapter Reference

## Sample provenance

The parser was written only after inspecting the real USPTO daily application
product `apc260105.zip`. The legacy `bulkdata.uspto.gov`, SOMS, and Reed Tech
hosts did not resolve from the development environment after USPTO's 2026 Open
Data Portal migration, so inspection used an append-only verbatim mirror of the
USPTO `TRTDXFAP` artifact.

- ZIP member: `apc260105.xml`
- XML size: 54,037,096 bytes
- Case files: 3,845
- Normalized searchable records: 3,733 (112 cases had no required serial or
  `mark-identification` and were not converted into fabricated text marks)
- ZIP SHA-256: `c9bdefba85ef1c05bca6e3f145c6502ccd50e4c297beff6958a361ea8b662eef`
- XML SHA-256: `1e8063ea57ea67e574dc498759c616256e6f8456d26a3018351e25e19d363619`
- DTD declared in the document: Trademark Applications Daily v2.0
- Document metadata: version `2.0`, version date `20041108`, creation datetime
  `202601050529`

The committed test fixture preserves verified paths and values from this file
while omitting unrelated record sections to keep the fixture reviewable.

## Observed hierarchy and normalized mapping

```text
trademark-applications-daily
├── version
├── creation-datetime
└── application-information
    └── file-segments
        ├── file-segment                  "TRMK"
        └── action-keys                   repeated
            ├── action-key
            └── case-file                 repeated
                ├── serial-number
                ├── registration-number
                ├── transaction-date
                ├── case-file-header
                │   ├── filing-date
                │   ├── status-code
                │   ├── mark-identification
                │   ├── abandonment-date
                │   └── cancellation-date
                ├── classifications
                │   └── classification    repeated
                │       ├── international-code
                │       ├── us-code        repeated
                │       └── status-code    classification status, not case status
                └── case-file-owners
                    └── case-file-owner    repeated
                        └── party-name
```

| Normalized field | Verified XML path/value |
|---|---|
| `sourceReferenceId` | `case-file/serial-number` |
| `markText` | `case-file/case-file-header/mark-identification` |
| `jurisdiction` | adapter constant `US` |
| `niceClasses` | repeated `case-file/classifications/classification/international-code` |
| `status` | search-level bucket derived from the case-header status/abandonment/cancellation fields |
| `rawStatusCode` | `case-file/case-file-header/status-code` |
| `filingDate` | `case-file/case-file-header/filing-date`, converted from `YYYYMMDD` |
| `sourceRegistry` | adapter constant `USPTO` |
| `sourceUpdatedAt` | `case-file/transaction-date`, converted from `YYYYMMDD` |

The first inspected case was serial `98038829`, mark
`NIMBL VISUAL MEDIA & DESIGN`, filing date `20230612`, case status `700`, and
international classes `035`, `041`, and `042`. The class records separately use
status code `6`; the parser matches the full path so it cannot overwrite case
status with classification status. XML entities are decoded by a real streaming
XML parser rather than regular-expression field extraction.

## Operational note

USPTO announced that Open Data Portal downloads require registered access from
June 18, 2026. `USPTO_BULK_LISTING_URL` is configurable so deployment can point
the same adapter at the client-authorized listing/mirror without changing XML
normalization or the Postgres-first pipeline. Do not silently substitute TSDR as
a bulk source: its adapter intentionally rejects `fetchUpdates`.
