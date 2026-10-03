# ERP to tenant announcements

The corporate CMS module already owns `GET/POST /api/v1/announcements` for public site notices. Platform messages pushed from ERP into a tenant dashboard use a separate inbox.

No ERP contract was present in this repository, so the receiver below is the contract. If ERP later publishes a different path, keep the item shape `{id, title, body, created_at, audience}`.

## Item

```json
{
  "id": 42,
  "title": "قطعی کوتاه سامانه",
  "body": "به‌روزرسانی از ساعت ۲۲ تا ۲۳.",
  "created_at": "2026-10-03T18:30:00+03:30",
  "audience": "staff",
  "read": false
}
```

`audience` is one of `all`, `staff`, `admins`.

- `all`: every signed-in user of the tenant
- `staff`: every role except `customer`
- `admins`: tenant `admin` only

`id` is the ERP id when the row was ingested, otherwise the local id. `read` is per user and is not part of the ERP payload.

## Tenant inbox

Authenticated (`auth:sanctum`), shared with the account portal:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/account/announcements` | List visible items plus `total` and `unread` |
| `POST` | `/api/v1/account/announcements/{id}/read` | Mark one item read |
| `POST` | `/api/v1/account/announcements/read` | Mark every visible item read |

```json
{
  "data": {
    "items": [],
    "total": 0,
    "unread": 0
  }
}
```

The dashboard header bell reads this list. Dates render Jalali with Persian digits when the UI locale is `fa`.

## ERP ingest

`POST /api/v1/integrations/erp/announcements`

Authorize with `Authorization: Bearer <WEBINO_ERP_API_TOKEN>`. This path does not require the dashboard AJAX header. A signed-in staff user can also post, which stores the row on that user's tenant when `tenant_id` and `tenant_domain` are omitted. A token call without a tenant target is visible to every tenant (`tenant_id` null).

```json
{
  "id": 42,
  "title": "قطعی کوتاه سامانه",
  "body": "به‌روزرسانی از ساعت ۲۲ تا ۲۳.",
  "created_at": "2026-10-03T18:30:00+03:30",
  "audience": "staff",
  "tenant_id": 7,
  "tenant_domain": "shop.example"
}
```

`tenant_id` and `tenant_domain` are optional routing fields. Repeating the same `id` updates the stored row.
