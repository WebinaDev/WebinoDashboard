---
id: store-management
title: API مدیریت فروشگاه
---

# API مدیریت فروشگاه

APIهای ادمین تحت `/api/v1` برای مدیریت فروشگاه (محصولات، برندها، دسته‌ها، ویژگی‌ها، قیمت‌گذاری، مارکت‌پلیس، پروفایل قهوه).

همه مسیرها نیاز به احراز هویت Sanctum و فعال‌بودن زیرماژول مربوط (`commerce.*` یا `coffee-profile.profile`) دارند.

## کاتالوگ

| متد | مسیر | گیت ماژول | توضیح |
|------|------|-----------|--------|
| GET/POST | `/products` | `catalog` | فیلتر: search، status، type، stock_status، category_id، brand_id |
| GET/PATCH/DELETE | `/products/{id}` | `catalog` | محصول کامل شامل فیلدهای ishop و WFCP |
| GET | `/products/lookup` | `catalog` | دسته‌ها، برندها، تگ‌ها، ویژگی‌ها، برچسب‌های ishop |
| POST | `/products/{id}/duplicate` | `catalog` | کپی پیش‌نویس |
| PUT | `/products/{id}/attributes` | `catalog` | همگام‌سازی ویژگی‌ها |
| PATCH | `/products/bulk` | `catalog` | به‌روزرسانی گروهی سازگار با کافه |
| CRUD | `/categories` | `catalog` | سلسله‌مراتبی با `parent_id` |
| CRUD | `/brands` | `brands` | سلسله‌مراتبی با `parent_id` |
| CRUD | `/attributes` و terms | `attributes` | انواع: select، color، image، button، text |
| CRUD | `/attribute-groups` | `attributes` | گروه‌های ازپیش‌تعریف‌شده ویژگی |

## تنوع‌ها

| متد | مسیر |
|------|------|
| GET/POST | `/products/{id}/variants` |
| PATCH/DELETE | `/variants/{id}` |
| POST | `/products/{id}/variations/generate` |
| POST | `/products/{id}/variations/bulk` |
| POST | `/products/{id}/variations/default` |

## قیمت‌گذاری (WFCP)

| متد | مسیر | توضیح |
|------|------|--------|
| GET/PUT | `/pricing/settings` | تنظیمات ماشین‌حساب |
| POST | `/pricing/calculate` | قیمت‌های محاسبه‌شده |
| POST | `/pricing/quick-add` | افزودن سریع محصول |
| GET | `/pricing/bulk-products` | لیست قیمت گروهی |
| PATCH | `/pricing/bulk-products/{id}/*` | ویرایش inline |
| PATCH | `/products/{id}/wfcp` | ذخیره قیمت از ادیتور |
| POST/GET | `/pricing/bulk-price-change/start\|state` | تغییر قیمت گروهی |

## مارکت‌پلیس

| متد | مسیر |
|------|------|
| GET/POST | `/marketplace/products/{id}/maps` |
| POST | `/marketplace/products/{id}/sync-now` |
| POST | `/marketplace/products/{id}/create-remote` |
| POST | `/marketplace/digikala/products/{id}/map` |

## پروفایل قهوه (قابل روشن/خاموش)

گیت: `coffee_profile` → `coffee-profile.profile`.

مسیرهای تنظیمات، origins و پروفایل محصول زیر `/coffee/*` و `/products/{id}/coffee-profile`.

## رابط ادمین

| مسیر | کاربرد |
|------|--------|
| `/admin/products` | لیست محصولات |
| `/admin/products/new` و `:id` | ادیتور (سئو و همگام‌سازی بله/تلگرام: به‌زودی) |
| `/admin/brands`، `product-categories`، `attributes` | تاکسونومی‌ها |
| `/admin/pricing/*` | ابزارهای WFCP |
| `/admin/coffee/settings` | تنظیمات ماژول قهوه |
