<?php

namespace App\Services\Bots\Engine;

/** Shared UI helpers for bot flows (Persian/RTL copy). */
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

    /** @param  list<list<array{text: string, callback_data?: string, url?: string}>>|null  $inline */
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
        $rows = [
            [['text' => self::MENU['store']], ['text' => self::MENU['search']]],
            [['text' => self::MENU['cart']], ['text' => self::MENU['orders']]],
            [['text' => self::MENU['account']]],
        ];
        $extra = [];
        if ($this->ctx->addon('loyalty')) {
            $extra[] = ['text' => self::MENU['loyalty']];
        }
        if ($this->ctx->addon('faq')) {
            $extra[] = ['text' => self::MENU['faq']];
        }
        if ($this->ctx->addon('tickets')) {
            $extra[] = ['text' => self::MENU['support']];
        }
        foreach (array_chunk($extra, 2) as $chunk) {
            $rows[] = $chunk;
        }
        if ($this->ctx->isAdmin()) {
            $rows[] = [['text' => self::MENU['admin']]];
        }

        return ['keyboard' => $rows, 'resize_keyboard' => true];
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
}
