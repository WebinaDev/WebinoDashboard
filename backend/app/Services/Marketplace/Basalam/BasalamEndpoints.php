<?php

namespace App\Services\Marketplace\Basalam;

/**
 * Basalam hosts and endpoints (port of WebinoBasalam\Config\Endpoints).
 */
final class BasalamEndpoints
{
    public const OPENAPI_BASE = 'https://openapi.basalam.com';

    public const ORDER_BASE = 'https://order-processing.basalam.com';

    public const CORE_BASE = 'https://core.basalam.com';

    public const UPLOAD_BASE = 'https://uploadio.basalam.com';

    public const CATEGORY_BASE = 'https://categorydetection.basalam.com';

    public const ACCOUNTING_BASE = 'https://accounting.basalam.com';

    public const IDENTITY_BASE = 'https://identity.basalam.com';

    public const USERS_ME = self::OPENAPI_BASE.'/v1/users/me';

    public const CATEGORIES = self::OPENAPI_BASE.'/v1/categories';

    public const CATEGORY_ATTRIBUTES = self::OPENAPI_BASE.'/v1/categories/%d/attributes?exclude_multi_selects=true';

    public const PRODUCT_CREATE = self::OPENAPI_BASE.'/v1/vendors/%d/products';

    public const PRODUCT_UPDATE = self::OPENAPI_BASE.'/v1/products/%d';

    public const PRODUCT_VARIATION_UPDATE = self::CORE_BASE.'/v4/products/%d/variations/%d';

    public const PRODUCT_BATCH_UPDATE = self::OPENAPI_BASE.'/v1/vendors/%d/products/batch-updates?continue_on_error=true';

    public const VENDOR_INFO = self::OPENAPI_BASE.'/v1/vendors/%d';

    public const VENDOR_PRODUCTS = self::OPENAPI_BASE.'/v1/vendors/%d/products';

    public const CATEGORY_DETECT = self::CATEGORY_BASE.'/category_detection/api_v1.0/predict/';

    public const MEDIA_UPLOAD_REQUEST = self::UPLOAD_BASE.'/v3/media/upload-request';

    public const MEDIA_UPLOAD_COMPLETE = self::UPLOAD_BASE.'/v3/media/complete';

    public const MEDIA_UPLOAD_STATUS = self::UPLOAD_BASE.'/v3/media/status/%s';

    public const PRODUCTS_DATA = self::CORE_BASE.'/v4/products';

    public const COMMISSION = self::CORE_BASE.'/api_v2/commission/get_percent';

    public const CATEGORIES_PREPARATION = self::CORE_BASE.'/v3/categories';

    public const WEBHOOKS = self::OPENAPI_BASE.'/v1/webhooks';

    public const VENDOR_PARCELS = self::OPENAPI_BASE.'/v1/vendor-parcels';

    public const ORDER_CONFIRM = self::ORDER_BASE.'/v1/vendor/set-preparation-order';

    public const ORDER_CANCEL = self::ORDER_BASE.'/v1/vendor/set-cancel';

    public const ORDER_CANCEL_REQUEST = self::ORDER_BASE.'/v1/vendor/order/%d/cancel-request';

    public const ORDER_DELAY = self::ORDER_BASE.'/v1/vendor/orders/%d/new-agreement';

    public const ORDER_TRACKING = self::ORDER_BASE.'/v2/vendor/set-posted-order';

    public const ORDER_AUTO_CONFIRM_CONFIG = self::ORDER_BASE.'/v1/vendor/automation-config';

    public const ORDER_DETAIL = self::ORDER_BASE.'/v2/vendors/%d/orders/%d';

    public const VENDOR_DISCOUNTS = self::OPENAPI_BASE.'/v1/vendors/%d/discounts';

    public const SHIPPING_PROFILES = self::OPENAPI_BASE.'/v1/shipping/profiles';

    public const SHIPPING_PROFILE = self::OPENAPI_BASE.'/v1/shipping/profiles/%d';

    public const SHIPPING_CARRIERS = self::OPENAPI_BASE.'/v1/shipping/carriers';

    public const SHIPPING_VENDOR_CARRIERS = self::OPENAPI_BASE.'/v1/shipping/vendor-carriers';

    public const SHIPPING_PROFILE_STRATEGY = self::OPENAPI_BASE.'/v1/shipping/profile-strategy';

    public const FINANCE_BALANCE = self::ACCOUNTING_BASE.'/financial/v1/client/transaction/balance';

    public const FINANCE_SETTLEMENTS = self::ACCOUNTING_BASE.'/financial/v1/client/balance-settlement';

    public const FINANCE_SETTLEMENT_CREATE = self::ACCOUNTING_BASE.'/financial/v2/client/balance-settlement';

    public const BANK_ACCOUNTS = self::IDENTITY_BASE.'/v1/users/bank-accounts';

    public const STATUS_TOKEN_VALIDATION = 'https://api.hamsalam.ir/api/v1/woo-plugin/validate-token';

    public const WEBHOOK_EVENT_IDS = [3, 5, 7];

    /** Parcel status ids used by webhooks and invoice details. */
    public const STATUS_REJECTED = 3067;

    public const STATUS_WAIT_VENDOR = 3739;

    public const STATUS_PREPARATION = 3237;

    public const STATUS_SHIPPING = 3238;

    public const STATUS_COMPLETED = 3195;

    public const STATUS_CANCELLED = 3233;

    /** Cancel reasons offered by the Basalam engine order popup. */
    public const CANCEL_REASONS = [
        3473 => 'قیمت محصول (قیمت اشتباه، کم، زیاد)',
        3474 => 'عدم موجودی',
        3479 => 'مشکلات ارسال',
        3481 => 'مشکلات شخصی غرفه‌دار',
        3573 => 'هزینه ارسال',
    ];

    /** Carriers offered by the Basalam engine shipping popup. */
    public const SHIPPING_METHODS = [
        3197 => 'پست سفارشی',
        3198 => 'پست پیشتاز',
        4040 => 'تیپاکس',
        6102 => 'ماهکس',
        6101 => 'چاپار',
        6112 => 'چیتاپست',
        6110 => 'آمادست',
        6111 => 'دکاپست',
        6113 => 'باکسیت',
        5137 => 'باربری',
        3259 => 'پیک',
        6114 => 'سلام رسان',
    ];

    public const DELAY_TOPIC = 5075;

    public const AUTO_CONFIRM_KEY = 6392;

    public static function isBasalamHost(string $url): bool
    {
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));

        return $host === 'basalam.com' || str_ends_with($host, '.basalam.com');
    }
}
