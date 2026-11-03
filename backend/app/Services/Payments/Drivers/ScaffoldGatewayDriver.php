<?php

namespace App\Services\Payments\Drivers;

/**
 * Connect-ready stub: validates required credentials, refuses live charge until official API lands.
 */
class ScaffoldGatewayDriver implements GatewayDriverInterface
{
    /**
     * @param  list<string>  $required
     */
    public function __construct(
        protected string $code,
        protected array $required = [],
        protected ?string $docsUrl = null,
    ) {}

    public function code(): string
    {
        return $this->code;
    }

    public function status(): string
    {
        return 'scaffold';
    }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        return [
            'ok' => false,
            'message' => 'این درگاه به‌زودی فعال می‌شود. زیرساخت تنظیمات آماده است.',
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        return [
            'ok' => false,
            'message' => 'این درگاه هنوز به API رسمی متصل نشده است.',
        ];
    }

    public function testConnection(array $config): array
    {
        $missing = [];
        foreach ($this->required as $key) {
            if (! filled($config[$key] ?? null)) {
                $missing[] = $key;
            }
        }
        if ($missing !== []) {
            return [
                'ok' => false,
                'message' => 'فیلدهای الزامی ناقص: '.implode(', ', $missing),
            ];
        }

        $hint = $this->docsUrl
            ? ' اعتبارنامه‌ها ذخیره شدند؛ اتصال API پس از پیاده‌سازی درایور. مستندات: '.$this->docsUrl
            : ' اعتبارنامه‌ها ذخیره شدند؛ اتصال API پس از پیاده‌سازی درایور.';

        return [
            'ok' => true,
            'message' => 'پیکربندی آماده است.'.$hint,
        ];
    }
}
