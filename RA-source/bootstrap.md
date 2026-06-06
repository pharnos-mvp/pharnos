# kb-source — README

This folder holds the **raw** PDF / Word / image regulatory documents you upload
locally. It is `.gitignored` and never committed (security + bandwidth).

The `kb-import` script (added Sprint 0 / Day 4) reads from this folder, runs
OCR + classification via Gemini 2.5 Flash multimodal, and writes the structured
YAML/MD output into `packages/regulatory-kb/` for review and commit.

## What to drop here

```
kb-source/
├── bootstrap.md              (this file — keep)
├── quick-facts.md            (your 5-line table per country)
├── uemoa-common/             (UEMOA-wide guidelines, ICH, WHO)
│   ├── *.pdf
│   └── *.docx
├── BJ/  TG/  CI/  SN/  ML/  BF/  NE/  GW/
│   ├── procedures/
│   ├── templates/            (letter templates, application forms)
│   ├── notifications-cases/  (anonymized real cases — VERY valuable)
│   └── fees-deadlines/
└── jurisprudence/            (case references, guidelines)
```

You can also dump everything **flat** in this folder — the import script
classifies automatically.

## What goes into git afterwards

Only the structured outputs in `packages/regulatory-kb/`:

- `common/ctd-structure.yaml`
- `common/glossary-medra.json`
- `common/audit-rules/*.yaml`
- `countries/<XX>/authority.yaml`
- `countries/<XX>/operations.yaml`
- `countries/<XX>/templates/*.md`

## Security

- Anonymize client-specific data before dropping here (real lab names, real
  product names of competitors, real patient data).
- This folder may live on your machine permanently as your personal RA archive,
  but it never leaves your laptop except through the structured KB.
