# API Envelope

All JSON API responses (except OpenAPI itself) use the shared envelope:

```json
{
  "success": true,
  "data": {},
  "message": null,
  "meta": null,
  "errors": null
}
```

Errors set `success: false` and may include `errors.code` / validation details. Message strings are localization keys resolved via `lang/{en,fa}` on the backend.
