<?php

namespace App\Services\Marketplace\Basalam;

/**
 * Persian, user-facing messages for transport / HTTP failures (plugin v0.9.65 humanizeTransportError).
 * Raw cURL text never reaches the admin UI.
 */
final class BasalamErrors
{
    public static function transport(string $raw): string
    {
        if (preg_match('/cURL error (\d+)/i', $raw, $m)) {
            switch ((int) $m[1]) {
                case 18:
                case 52:
                case 56:
                    return 'پاسخ سرور ناقص رسید (احتمالاً CDN جلوی سرور پاسخ را قطع کرده). چند دقیقه بعد دوباره تلاش کنید؛ اگر تکرار شد به پشتیبانی وبینا خبر دهید.';
                case 28:
                    return 'سرور در زمان مقرر پاسخ نداد. چند دقیقه بعد دوباره تلاش کنید.';
                case 6:
                    return 'نشانی سرور پیدا نشد (خطای DNS). با پشتیبانی تماس بگیرید.';
                case 7:
                    return 'اتصال به سرور برقرار نشد؛ ممکن است فایروال درخواست‌های خروجی را مسدود کرده باشد.';
                case 35:
                case 60:
                    return 'ارتباط امن (SSL) با سرور برقرار نشد. گواهی‌های SSL را بررسی کنید.';
            }
        }
        if (stripos($raw, 'timed out') !== false) {
            return 'سرور در زمان مقرر پاسخ نداد. چند دقیقه بعد دوباره تلاش کنید.';
        }

        return 'ارتباط با سرور برقرار نشد. چند دقیقه بعد دوباره تلاش کنید.';
    }

    public static function http(int $code): string
    {
        if ($code === 503) {
            return 'اتصال باسلام در سرور وبینا هنوز پیکربندی نشده یا موقتاً در دسترس نیست (کد 503).';
        }
        if ($code >= 500) {
            return sprintf('سرور وبینا با خطا پاسخ داد (کد %d). چند دقیقه بعد دوباره تلاش کنید.', $code);
        }
        if ($code === 429) {
            return 'تعداد درخواست‌ها زیاد است؛ کمی صبر کنید و دوباره تلاش کنید.';
        }

        return sprintf('پاسخ نامعتبر از سرور وبینا (کد %d).', $code);
    }
}
