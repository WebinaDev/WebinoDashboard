<?php

namespace App\Services\Bots\Engine;

/** Shared UI helpers for bot flows (Persian/RTL copy + page-builder overrides). */
abstract class BotFlow
{
    public const MENU = [
        'store' => '🛍 فروشگاه',
        'search' => '🔎 جستجو',
        'cart' => '🛒 سبد خرید',
        'orders' => '📦 سفارش‌های من',
        'account' => '👤 حساب من',
        'loyalty' => '🎁 باشگاه مشتریان',
        'faq' => '❓ سوالات متداول',
        'support' => '🎫 پشتیبانی',
        'admin' => '🛠 مدیریت',
        'wishlist' => '❤️ علاقه‌مندی‌ها',
        'sale' => '🔥 حراج',
        'referral' => '🔗 دعوت دوستان',
        'webapp' => '🌐 وب‌اپ',
    ];

    public const DEFAULT_TEMPLATES = [
        'welcome' => "سلام {name} 👋\nبه ربات فروشگاه {store} خوش آمدید. از منوی زیر انتخاب کنید.",
        'cart_empty' => 'سبد خرید شما خالی است.',
        'ask_contact' => 'برای ادامه، شماره موبایل خود را با دکمهٔ زیر ارسال کنید.',
        'ask_name' => 'نام و نام خانوادگی گیرنده را بنویسید:',
        'ask_address' => 'نشانی کامل پستی را بنویسید (یا موقعیت مکانی را بفرستید):',
        'ask_postcode' => 'کد پستی ۱۰ رقمی را بنویسید (یا «ندارد»):',
        'order_created' => "سفارش #{order_number} ثبت شد.\nمبلغ قابل پرداخت: {total}",
        'paid' => '✅ پرداخت سفارش #{order_number} تأیید شد. سپاس از خرید شما.',
        'unknown' => 'متوجه نشدم. لطفاً از منو انتخاب کنید.',
    ];

    public function __construct(protected BotContext $ctx) {}

    /** Resolve menu label (page_builder.labels override). */
    protected function menuLabel(string $key): string
    {
        $pb = is_array($this->ctx->meta()['page_builder'] ?? null) ? $this->ctx->meta()['page_builder'] : [];
        $labels = is_array($pb['labels'] ?? null) ? $pb['labels'] : [];
        $custom = trim((string) ($labels[$key] ?? ''));

        return $custom !== '' ? $custom : (self::MENU[$key] ?? $key);
    }

    /** Whether a page-builder menu key is enabled (default true when unset). */
    protected function menuEnabled(string $key): bool
    {
        $pb = is_array($this->ctx->meta()['page_builder'] ?? null) ? $this->ctx->meta()['page_builder'] : [];
        $menu = is_array($pb['menu'] ?? null) ? $pb['menu'] : [];
        if ($menu === [] || ! array_key_exists($key, $menu)) {
            return true;
        }

        return (bool) $menu[$key];
    }

    /** Match inbound text against a menu key (default or custom label). */
    protected function isMenuText(string $text, string $key): bool
    {
        if ($text === '') {
            return false;
        }
        if ($text === (self::MENU[$key] ?? null) || $text === $this->menuLabel($key)) {
            return true;
        }

        return false;
    }

    /** @return list<string> All active reply-keyboard texts (for state interrupt). */
    public static function activeMenuTexts(BotContext $ctx): array
    {
        $flow = new class($ctx) extends BotFlow
        {
            public function texts(): array
            {
                $out = [];
                foreach (array_keys(self::MENU) as $key) {
                    if ($key === 'admin' && ! $this->ctx->isAdmin()) {
                        continue;
                    }
                    if (in_array($key, ['loyalty', 'faq', 'support', 'referral'], true) && ! $this->addonVisible($key)) {
                        continue;
                    }
                    if ($key === 'webapp' && ! $this->webappUrl()) {
                        continue;
                    }
                    if (! $this->menuEnabled($key) && $key !== 'admin') {
                        continue;
                    }
                    $out[] = $this->menuLabel($key);
                    if (($def = self::MENU[$key] ?? null) && $def !== $out[array_key_last($out)]) {
                        $out[] = $def;
                    }
                }

                return array_values(array_unique($out));
            }

            private function addonVisible(string $key): bool
            {
                return match ($key) {
                    'loyalty' => $this->ctx->addon('loyalty') || $this->ctx->addon('referral'),
                    'faq' => $this->ctx->addon('faq'),
                    'support' => $this->ctx->addon('tickets'),
                    'referral' => $this->ctx->addon('referral') || ! empty(($this->ctx->meta()['referral']['enabled'] ?? false)),
                    default => true,
                };
            }

            private function webappUrl(): string
            {
                return self::resolveWebappUrl($this->ctx);
            }
        };

        return $flow->texts();
    }

    public static function resolveWebappUrl(BotContext $ctx): string
    {
        if (! $ctx->addon('webapp')) {
            return '';
        }
        $meta = $ctx->meta();
        $url = trim((string) (
            ($meta['widget']['webapp_url'] ?? null)
            ?: ($meta['club']['webapp_base_url'] ?? null)
            ?: ($meta['referral']['webapp_base_url'] ?? null)
            ?: ''
        ));

        return $url !== '' && str_starts_with($url, 'http') ? $url : '';
    }

    public static function homeBlocksText(BotContext $ctx): string
    {
        $pb = is_array($ctx->meta()['page_builder'] ?? null) ? $ctx->meta()['page_builder'] : [];
        $raw = trim((string) ($pb['home_blocks'] ?? ''));

        return $raw;
    }

    /** Render a tenant-overridable template (meta.templates). */
    protected function tpl(string $key, array $vars = []): string
    {
        $custom = $this->ctx->meta()['templates'][$key] ?? null;
        $text = is_string($custom) && trim($custom) !== '' ? $custom : (self::DEFAULT_TEMPLATES[$key] ?? $key);
        foreach ($vars as $k => $v) {
            $text = str_replace('{'.$k.'}', (string) $v, $text);
        }

        return $text;
    }

    /** @param  list<list<array{text: string, callback_data?: string, url?: string, web_app?: array{url: string}}>>|null  $inline */
    protected function send(string $text, ?array $inline = null, ?array $replyKeyboard = null): array
    {
        $payload = ['chat_id' => $this->ctx->chatId, 'text' => $text];
        if ($inline !== null) {
            $payload['reply_markup'] = ['inline_keyboard' => $inline];
        } elseif ($replyKeyboard !== null) {
            $payload['reply_markup'] = $replyKeyboard;
        }

        return BotMessenger::call($this->ctx->tenantId(), $this->ctx->provider(), $this->ctx->client, 'sendMessage', $payload);
    }

    protected function sendPhoto(string $photo, string $caption, ?array $inline = null): array
    {
        $payload = ['chat_id' => $this->ctx->chatId, 'photo' => $photo, 'caption' => $caption];
        if ($inline !== null) {
            $payload['reply_markup'] = ['inline_keyboard' => $inline];
        }

        return BotMessenger::call($this->ctx->tenantId(), $this->ctx->provider(), $this->ctx->client, 'sendPhoto', $payload);
    }

    protected function mainMenu(): array
    {
        $row = function (string ...$keys): array {
            $btns = [];
            foreach ($keys as $key) {
                if (! $this->menuEnabled($key)) {
                    continue;
                }
                $btns[] = ['text' => $this->menuLabel($key)];
            }

            return $btns;
        };

        $rows = array_values(array_filter([
            $row('store', 'search'),
            $row('cart', 'orders'),
            $row('account'),
        ], fn ($r) => $r !== []));

        $extra = [];
        if ($this->menuEnabled('sale')) {
            $extra[] = ['text' => $this->menuLabel('sale')];
        }
        if ($this->menuEnabled('wishlist')) {
            $extra[] = ['text' => $this->menuLabel('wishlist')];
        }
        if (($this->ctx->addon('loyalty') || $this->ctx->addon('referral')) && $this->menuEnabled('loyalty')) {
            $extra[] = ['text' => $this->menuLabel('loyalty')];
        }
        if (($this->ctx->addon('referral') || ! empty($this->ctx->meta()['referral']['enabled'])) && $this->menuEnabled('referral')) {
            $extra[] = ['text' => $this->menuLabel('referral')];
        }
        if ($this->ctx->addon('faq') && $this->menuEnabled('faq')) {
            $extra[] = ['text' => $this->menuLabel('faq')];
        }
        if ($this->ctx->addon('tickets') && $this->menuEnabled('support')) {
            $extra[] = ['text' => $this->menuLabel('support')];
        }
        $webapp = self::resolveWebappUrl($this->ctx);
        if ($webapp !== '' && $this->menuEnabled('webapp')) {
            // Reply keyboards on Telegram/Bale support web_app buttons.
            $extra[] = ['text' => $this->menuLabel('webapp'), 'web_app' => ['url' => $webapp]];
        }
        foreach (array_chunk($extra, 2) as $chunk) {
            $rows[] = $chunk;
        }
        if ($this->ctx->isAdmin()) {
            $rows[] = [['text' => $this->menuLabel('admin')]];
        }

        return ['keyboard' => $rows ?: [[['text' => $this->menuLabel('store')]]], 'resize_keyboard' => true];
    }

    /** Inline WebApp button rows for welcome / account. */
    protected function webappInline(): ?array
    {
        $url = self::resolveWebappUrl($this->ctx);
        if ($url === '') {
            return null;
        }

        return [[['text' => $this->menuLabel('webapp'), 'web_app' => ['url' => $url]]]];
    }

    protected function contactKeyboard(): array
    {
        return [
            'keyboard' => [[['text' => '📱 ارسال شماره موبایل', 'request_contact' => true]], [['text' => 'انصراف']]],
            'resize_keyboard' => true,
            'one_time_keyboard' => true,
        ];
    }

    public static function money(int $minor, string $currency = 'IRT'): string
    {
        $n = number_format($minor);

        return $currency === 'IRR' ? $n.' ریال' : $n.' تومان';
    }

    protected function storeName(): string
    {
        $t = \App\Models\Tenant::query()->find($this->ctx->tenantId());

        return (string) ($t?->store_display_name ?: $t?->name ?: 'ما');
    }

    protected function siteUrl(): string
    {
        return \App\Services\Marketplace\Basalam\BasalamAuth::siteUrl($this->ctx->tenantId());
    }

    protected function botDeepLink(string $payload = ''): string
    {
        $username = ltrim((string) ($this->ctx->meta()['bot_username'] ?? ''), '@');
        if ($username === '') {
            return '';
        }
        $base = $this->ctx->provider() === 'bale' ? 'https://ble.ir/' : 'https://t.me/';
        $url = $base.$username;
        if ($payload !== '') {
            $url .= '?start='.rawurlencode($payload);
        }

        return $url;
    }
}
