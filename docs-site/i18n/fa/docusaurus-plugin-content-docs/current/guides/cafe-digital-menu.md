# منوی دیجیتال کافه — API

endpointهای عمومی و ادمین برای ماژول کافه/رستوران (منو، بنر، رزرو، سبد مهمان، تعامل).

## کاتالوگ عمومی (گسترش‌یافته)

```http
GET /api/v1/public/catalog?menu={slug}&branch={slug}&q={query}
```

دسته‌ها، آیتم‌ها (با مدیا، آلرژی، modifier)، منوها، بنرها (حداکثر ۳)، شعبه‌ها، ساعات کاری و تنظیمات engagement.

```http
GET /api/v1/public/catalog/items/{slug}
```

جزئیات یک آیتم.

## سفارش روی میز (مهمان)

```http
GET /api/v1/public/cafe/cart?guest_token={token}&table={n}
POST /api/v1/public/cafe/cart/items
POST /api/v1/public/cafe/checkout
```

## رزرو

```http
GET /api/v1/public/cafe/events
POST /api/v1/public/cafe/reservations
POST /api/v1/public/cafe/events/{id}/bookings
```

## تعامل مهمان

```http
GET /api/v1/public/cafe/phone-gate?fingerprint={fp}
POST /api/v1/public/cafe/phone-register
POST /api/v1/public/cafe/products/{id}/like
POST /api/v1/public/cafe/products/{id}/feedback
```

## ادمین (Sanctum)

منوها، بنرها، آلرژی، modifier، QR/PDF، شعبه، رزرو و رویداد — جزئیات در نسخه انگلیسی [`cafe-digital-menu`](./cafe-digital-menu.md).

مشخص زنده: `GET /api/v1/openapi.json`
