# Inspections overhaul — custom-field forms, Fleetio parity

The first cut on fleetops#319 modelled an inspection form as a JSON list of
pass/fail items. That is a checklist, not an inspection form. The fliit client
module (`packages/fliit`) already has the right shape and its customers expect
Fleetio-style parity: a form is **groups of typed fields** built with the
platform's custom-field system, and an inspection is that form **filled in**,
with photos, a signature, an odometer, and follow-up. This document is the
target for the second cut, on the same branch.

## The model

| Piece | Was (first cut) | Becomes |
|---|---|---|
| Form structure | `inspection_forms.items` JSON | `Category` rows (`for = custom_field_group`, `owner = form`) holding `CustomField` rows (`subject = form`, `for = fleetops_inspection_form`), ordered. Exposed as `grouped_fields`. `items` is kept read-only for one release and migrated into a "Checklist" group of `pass-fail` fields. |
| Field types | pass/fail only | `pass-fail`, `input`, `textarea`, `number` (meter, `meta.unit`), `select`, `radio-button`, `boolean`, `date-picker`, `date-time-input`, `file-upload` (photo), `signature`. Shared with ember-ui where the type exists there; the inspection-only ones render through FleetOps' own field input/value components. |
| Pass/fail rules | severity on the item | `meta` on the field: `severity` (default for a defect), `require_photo_on_fail`, `require_comment_on_fail`, `unsafe_on_fail`, `instructions`. |
| Answers | `inspection_item_results` rows | `custom_field_values` on the submission (`HasCustomFields`, `syncCustomFieldValues`). **`inspection_item_results` stays**, derived from every `pass-fail` value — it is what issues and work orders are generated from, and what the history shows. |
| Photos / signature | base64 arrays in the item row | Files. A photo or signature value arrives as base64 (the app is offline-first and cannot upload first); the submitter stores it through `File` and keeps `file:<uuid>` as the value, the platform's own convention. Submission-level photos use `ModelMultiFileUpload` in the console. |
| Console builder | ad-hoc list editor | The fliit builder: field groups, per-group grid size, add/edit/delete fields through the registry panel, draft support before the first save (`FormSyncService`). |
| Console inspection | ad-hoc results editor | Header (form, vehicle, driver, odometer, engine hours, status) + one `ContentPanel` per group rendering the fields; details use the value renderer; **Audit** tab from the activity log; photos panel. |
| Reports | none | `InspectionExport` (xlsx/csv) on the internal namespace, like fuel reports. |

## Driver API contract (v1) — what the app codes against

`GET /v1/inspection-forms/{id}` adds:

```jsonc
"grouped_fields": [
  { "id": "…", "name": "Exterior", "description": null, "order": 1, "meta": { "grid_size": 1 },
    "fields": [
      { "id": "custom_field_…", "name": "mirrors", "label": "Mirrors", "description": "…", "help_text": "…",
        "type": "pass-fail", "required": true, "options": [], "order": 1,
        "meta": { "severity": "medium", "require_photo_on_fail": false, "require_comment_on_fail": true, "unsafe_on_fail": false } }
    ] }
]
```

`POST /v1/inspections` accepts, in addition to the first cut's body:

```jsonc
"custom_field_values": [
  { "custom_field": "custom_field_…", "value_type": "object",
    "value": { "passed": false, "severity": "high", "comments": "…", "photos": ["<base64>"], "unsafe": true } },
  { "custom_field": "custom_field_…", "value_type": "number", "value": 112480 },
  { "custom_field": "custom_field_…", "value_type": "text",   "value": "…" },
  { "custom_field": "custom_field_…", "value_type": "file",   "value": "<base64 png>" }
]
```

`item_results[]` is still accepted for the tokenised public link and for older
app builds; when `custom_field_values` is present the server derives the item
results from the `pass-fail` values and ignores a duplicated `item_results`.

The submission resource returns `custom_field_values` (label, type, value —
file values resolved to `{ id, url }`), `item_results`, `issue`, `work_order`.

## What stays from the first cut

Publishing, the tokenised public link, the settings-driven issue / work order
creation, the driver `v1` routes, idempotent replay, the migration timestamp,
the seed and Postman PRs (both need the new fields added to their bodies).

## Out of scope for this cut, named so nobody assumes it

Inspection schedules per vehicle with compliance reporting, and the Fleetio
"inspection item templates" library. Both are additive on top of this model.
