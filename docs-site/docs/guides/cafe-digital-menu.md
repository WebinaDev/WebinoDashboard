# Cafe digital menu API

Public and admin endpoints for the cafe/restaurant module (menus, banners, reservations, guest cart, engagement).

## Public catalog (extended)

```http
GET /api/v1/public/catalog?menu={slug}&branch={slug}&q={query}
```

Returns categories, items (with media, allergens, modifiers), menus, banners (max 3), branches, hours, and engagement settings.

```http
GET /api/v1/public/catalog/items/{slug}
```

Single item with variants, modifiers, allergens, media, and like count.

## Guest table ordering

Requires `cafe` module and commerce `cart`/`checkout` activations on the tenant.

```http
GET /api/v1/public/cafe/cart?guest_token={token}&table={n}
POST /api/v1/public/cafe/cart/items
POST /api/v1/public/cafe/checkout
```

Pass `X-Guest-Token` header or `guest_token` in JSON. Table number from QR: `?table=12`.

## Reservations

```http
GET /api/v1/public/cafe/events
POST /api/v1/public/cafe/reservations
POST /api/v1/public/cafe/events/{id}/bookings
```

## Engagement

```http
GET /api/v1/public/cafe/phone-gate?fingerprint={fp}
POST /api/v1/public/cafe/phone-register
POST /api/v1/public/cafe/products/{id}/like
POST /api/v1/public/cafe/products/{id}/feedback
```

## Admin (Sanctum)

| Area | Endpoints |
|------|-----------|
| Menus | `GET/POST/PATCH/DELETE /api/v1/menus` |
| Banners | `GET/POST/PATCH/DELETE /api/v1/menu-banners` (max 3) |
| Allergens | `GET/POST/PATCH/DELETE /api/v1/allergens` |
| Modifiers | `GET/POST /api/v1/products/{id}/modifiers`, `PUT .../allergens`, `PUT .../media` |
| Bulk | `PATCH /api/v1/products/bulk` |
| QR / PDF | `GET/PATCH /api/v1/cafe/qr-settings`, `GET /api/v1/cafe/qr`, `GET /api/v1/cafe/menu-pdf` |
| Branches | `GET/POST/PATCH/DELETE /api/v1/cafe/branches` |
| Reservations | `GET /api/v1/cafe/reservations`, `PATCH /api/v1/cafe/reservations/{id}` |
| Events | `POST/PATCH /api/v1/cafe/events`, `PATCH /api/v1/cafe/event-bookings/{id}` |
| Engagement | `GET/PATCH /api/v1/cafe/engagement-settings` |

Module middleware aliases: `cafe_menu`, `cafe_qr`, `cafe_reservations`, `catalog`, `cart`, `checkout`.

See live spec: `GET /api/v1/openapi.json`
