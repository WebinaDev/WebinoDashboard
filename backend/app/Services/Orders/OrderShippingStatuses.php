<?php

namespace App\Services\Orders;

/**
 * Custom shipping statuses, Tapin code mapping, and SMS event keys (WP parity).
 */
final class OrderShippingStatuses
{
    /** @var list<string> */
    public const SHIPPING = [
        'webino-in-stock',
        'sent-to-warehouse',
        'webino-packaged',
        'webino-courier',
        'webino-post',
        'webino-tipax',
        'webino-ready-to-ship',
        'webino-shipping',
        'webino-returned',
        'webino-deleted',
        'webino-need-review',
    ];

    /**
     * Map order status → SMS / notify event key.
     *
     * @return array<string, string>
     */
    public static function smsMap(): array
    {
        return [
            'pending_payment' => 'pending',
            'awaiting_gateway' => 'pending',
            'on_hold' => 'on-hold',
            'paid' => 'processing',
            'payment_failed' => 'failed',
            'processing' => 'processing',
            'shipped' => 'completed',
            'completed' => 'completed',
            'cancelled' => 'cancelled',
            'refunded' => 'refunded',
            'failed' => 'failed',
            'webino-in-stock' => 'sent-to-warehouse',
            'sent-to-warehouse' => 'sent-to-warehouse',
            'webino-packaged' => 'packaged',
            'webino-courier' => 'courier',
            'webino-post' => 'post',
            'webino-tipax' => 'tipax',
            'webino-ready-to-ship' => 'post',
            'webino-shipping' => 'post',
            'webino-returned' => 'refunded',
            'webino-deleted' => 'cancelled',
            'webino-need-review' => 'on-hold',
        ];
    }

    public static function smsEventFor(string $status): ?string
    {
        $map = self::smsMap();

        return $map[$status] ?? null;
    }

    /**
     * Tapin numeric status → dashboard order status (without wc- prefix).
     */
    public static function fromTapinCode(int $code): ?string
    {
        if ($code <= 0) {
            return null;
        }

        $map = [
            1 => 'webino-packaged',
            2 => 'webino-ready-to-ship',
            5 => 'webino-shipping',
            7 => 'completed',
            10 => 'webino-returned',
            11 => 'webino-returned',
            13 => 'webino-shipping',
            14 => 'webino-shipping',
            15 => 'webino-shipping',
            16 => 'webino-shipping',
            17 => 'webino-shipping',
            50 => 'webino-shipping',
            70 => 'completed',
            71 => 'completed',
            72 => 'completed',
            80 => 'webino-deleted',
            83 => 'webino-returned',
            102 => 'webino-returned',
        ];

        return $map[$code] ?? 'webino-need-review';
    }

    /**
     * Human label keys for backend (fa). Frontend uses i18n enums.
     *
     * @return array<string, string>
     */
    public static function labelsFa(): array
    {
        return [
            'webino-in-stock' => 'انبار',
            'sent-to-warehouse' => 'ارسال به انبار',
            'webino-packaged' => 'بسته‌بندی‌شده',
            'webino-courier' => 'پیک',
            'webino-post' => 'پست',
            'webino-tipax' => 'تیپاکس',
            'webino-ready-to-ship' => 'آمادهٔ ارسال',
            'webino-shipping' => 'در حال ارسال',
            'webino-returned' => 'برگشتی',
            'webino-deleted' => 'حذف‌شده',
            'webino-need-review' => 'نیازمند بررسی',
        ];
    }

    public static function label(string $status, string $locale = 'fa'): string
    {
        if ($locale === 'fa') {
            $fa = array_merge([
                'pending_payment' => 'در انتظار پرداخت',
                'awaiting_gateway' => 'در انتظار درگاه',
                'on_hold' => 'در انتظار بررسی',
                'paid' => 'پرداخت‌شده',
                'payment_failed' => 'پرداخت ناموفق',
                'processing' => 'در حال پردازش',
                'shipped' => 'ارسال‌شده',
                'completed' => 'تکمیل‌شده',
                'cancelled' => 'لغوشده',
                'refunded' => 'مسترد شده',
                'failed' => 'ناموفق',
            ], self::labelsFa());

            return $fa[$status] ?? $status;
        }

        return $status;
    }
}
