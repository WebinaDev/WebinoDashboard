<?php

namespace App\Services\Bots\Engine;

use App\Models\BotSession;
use App\Models\BotSetting;
use App\Services\Bots\BotClient;
use App\Services\Bots\BotClientFactory;
use App\Services\Payments\BalePayService;

/**
 * Conversational router for Bale & Telegram (webhook + polling).
 */
final class BotEngine
{
    public function handle(BotSetting $setting, array $update, ?BotClient $client = null): void
    {
        $client ??= BotClientFactory::forSetting($setting);
        if (! empty($update['pre_checkout_query']) && $client) {
            app(BalePayService::class)->preCheckout((int) $setting->tenant_id, $client, (array) $update['pre_checkout_query']);

            return;
        }
        if (! empty($update['message']['successful_payment'])) {
            $paid = app(BalePayService::class)->successfulPayment(
                (int) $setting->tenant_id,
                (string) data_get($update, 'message.chat.id'),
                (array) $update['message']['successful_payment'],
            );
            $client?->call('sendMessage', [
                'chat_id' => (string) data_get($update, 'message.chat.id'),
                'text' => $paid ? 'پرداخت با موفقیت ثبت شد. سپاس!' : 'پرداخت تأیید نشد؛ با پشتیبانی تماس بگیرید.',
            ]);

            return;
        }
        $callback = $update['callback_query'] ?? null;
        $message = $update['message'] ?? $update['edited_message'] ?? ($callback['message'] ?? null);
        $chatId = (string) (data_get($message, 'chat.id') ?? data_get($update, 'chat.id') ?? '');
        if ($chatId === '') {
            return;
        }
        $from = (array) ($callback['from'] ?? data_get($message, 'from') ?? []);
        $session = BotSession::query()->firstOrNew([
            'tenant_id' => $setting->tenant_id,
            'provider' => $setting->provider,
            'chat_id' => $chatId,
        ]);
        $meta = is_array($session->meta) ? $session->meta : [];
        $meta['from'] = $from ?: ($meta['from'] ?? null);
        if (! $callback) {
            $meta['text'] = data_get($message, 'text');
        }
        $session->meta = $meta;
        $session->last_seen_at = now();
        $session->save();

        $ctx = new BotContext($setting, $session, $client, $chatId, $from);

        // Force-join gate (before any other handling except membership callbacks).
        $cbData = $callback ? (string) ($callback['data'] ?? '') : null;
        if ($callback && $client && ! empty($callback['id'])) {
            // Answer early so UI doesn't spin; force-join may still block.
            if (! str_starts_with($cbData ?? '', 'fj:')) {
                $client->call('answerCallbackQuery', ['callback_query_id' => (string) $callback['id']]);
            } else {
                $client->call('answerCallbackQuery', ['callback_query_id' => (string) $callback['id']]);
            }
        }
        $gate = new ForceJoinGate($ctx);
        if (! $gate->allow($cbData)) {
            return;
        }
        if ($callback && str_starts_with($cbData ?? '', 'fj:')) {
            // Membership just cleared — continue into welcome for a clean UX.
            if ($cbData === 'fj:check' || $cbData === 'fj:skip') {
                $this->welcome($ctx);

                return;
            }
        }

        if ($callback) {
            $this->callback($ctx, (string) ($callback['data'] ?? ''));

            return;
        }
        if (is_array($message)) {
            $this->message($ctx, $message);
        }
    }

    private function message(BotContext $ctx, array $message): void
    {
        $text = trim((string) ($message['text'] ?? ''));
        $shop = new ShopFlow($ctx);
        $addons = new AddonsFlow($ctx);
        $admin = new AdminFlow($ctx);
        $menuTexts = BotFlow::activeMenuTexts($ctx);
        $hit = fn (string $key): bool => (new class($ctx) extends BotFlow
        {
            public function hit(string $key, string $text): bool
            {
                return $this->isMenuText($text, $key);
            }
        })->hit($key, $text);

        if ($text === '/start' || str_starts_with($text, '/start ')) {
            $payload = trim(substr($text, 6));
            $ctx->setState('', []);
            if ($payload !== '') {
                $addons->consumeStartPayload($payload);
            }
            $this->welcome($ctx);
            if (str_starts_with($payload, 'pay_') && $ctx->client) {
                app(BalePayService::class)->sendInvoice($ctx->tenantId(), $ctx->client, $ctx->chatId, (int) substr($payload, 4));
            } elseif (str_starts_with($payload, 'p_')) {
                $shop->product((int) substr($payload, 2));
            } elseif ($payload === 'cart') {
                $shop->showCart();
            }

            return;
        }

        // Contact share outside checkout = account linking (+ referral settle).
        if (! empty($message['contact']) && $ctx->state() !== 'checkout_contact') {
            if ($user = $shop->linkContact((array) $message['contact'])) {
                $ctx->setState('', []);
                $addons->settleReferralForUser($user);
                (new class($ctx) extends BotFlow
                {
                    public function ok(string $name): void
                    {
                        $this->send('✅ حساب «'.$name.'» به ربات متصل شد.', null, $this->mainMenu());
                    }
                })->ok((string) $user->name);
            }

            return;
        }

        $state = $ctx->state();
        $isMenu = in_array($text, $menuTexts, true);
        if ($state !== '' && ! $isMenu) {
            if (str_starts_with($state, 'checkout_') && $shop->handleCheckoutText($text, $message)) {
                return;
            }
            if ($addons->handleTicketText($text)) {
                return;
            }
            if ($state === 'admin_ticket_reply' && $ctx->isAdmin()) {
                $admin->ticketReply($text);

                return;
            }
            if ($state === 'search') {
                $ctx->setState('', []);
                $shop->products(0, 1, mb_substr($text, 0, 64));

                return;
            }
            if ($state === 'link_contact') {
                $ctx->setState('', []);
            }
        } elseif ($isMenu && $state !== '') {
            $ctx->setState('', []);
        }

        match (true) {
            $hit('store') || $text === '/shop' => $shop->categories(),
            $hit('search') || $text === '/search' => $this->askSearch($ctx),
            $hit('cart') || $text === '/cart' => $shop->showCart(),
            $hit('orders') || $text === '/orders' => $shop->orders(),
            $hit('account') || $text === '/account' => $shop->account(),
            $hit('sale') || $text === '/sale' => $shop->saleProducts(),
            $hit('wishlist') || $text === '/wishlist' => $shop->wishlist(),
            ($hit('faq') || $text === '/faq') && $ctx->addon('faq') => $addons->faq(),
            ($hit('support') || $text === '/support') && $ctx->addon('tickets') => $addons->support(),
            ($hit('loyalty') || $text === '/points') && ($ctx->addon('loyalty') || $ctx->addon('referral')) => $addons->loyalty(),
            $text === '/daily' && $ctx->addon('loyalty') => $addons->daily(),
            ($hit('referral') || $text === '/invite') && ($ctx->addon('referral') || ! empty($ctx->meta()['referral']['enabled'])) => $addons->referral(),
            $hit('webapp') && BotFlow::resolveWebappUrl($ctx) !== '' => $this->openWebapp($ctx),
            ($hit('admin') || $text === '/admin') && $ctx->isAdmin() => $admin->menu(),
            default => $this->fallback($ctx, $addons, $shop, $text),
        };
    }

    private function openWebapp(BotContext $ctx): void
    {
        (new class($ctx) extends BotFlow
        {
            public function go(): void
            {
                $url = self::resolveWebappUrl($this->ctx);
                if ($url === '') {
                    $this->send('وب‌اپ فعال نیست.');

                    return;
                }
                $this->send('برای باز کردن وب‌اپ روی دکمه بزنید:', $this->webappInline(), $this->mainMenu());
            }
        })->go();
    }

    private function fallback(BotContext $ctx, AddonsFlow $addons, ShopFlow $shop, string $text): void
    {
        if ($text !== '' && $addons->matchFaq($text)) {
            return;
        }
        if (mb_strlen($text) >= 2 && ! str_starts_with($text, '/')) {
            $shop->products(0, 1, mb_substr($text, 0, 64));

            return;
        }
        $this->welcome($ctx, true);
    }

    private function askSearch(BotContext $ctx): void
    {
        $ctx->setState('search', []);
        (new class($ctx) extends BotFlow
        {
            public function go(): void
            {
                $this->send('نام محصول یا کد آن را بنویسید:');
            }
        })->go();
    }

    private function welcome(BotContext $ctx, bool $unknown = false): void
    {
        (new class($ctx) extends BotFlow
        {
            public function go(bool $unknown): void
            {
                $name = (string) ($this->ctx->from['first_name'] ?? '');
                $text = $unknown ? $this->tpl('unknown') : $this->tpl('welcome', ['name' => $name, 'store' => $this->storeName()]);
                $blocks = self::homeBlocksText($this->ctx);
                if ($blocks !== '' && ! $unknown) {
                    $text .= "\n\n".$blocks;
                }
                $inline = $this->webappInline();
                $this->send($text, $inline, $this->mainMenu());
            }
        })->go($unknown);
    }

    private function callback(BotContext $ctx, string $data): void
    {
        $shop = new ShopFlow($ctx);
        $addons = new AddonsFlow($ctx);
        $admin = new AdminFlow($ctx);
        $parts = explode(':', $data);
        $op = $parts[0] ?? '';
        $a = $parts[1] ?? '';
        $b = $parts[2] ?? '';

        match ($op) {
            'cats' => $shop->categories(),
            'c' => $shop->products((int) $a, (int) ($b ?: 1)),
            'sale' => $shop->saleProducts((int) ($a ?: 1)),
            'p' => $shop->product((int) $a),
            'a' => $shop->add((int) $a),
            'cart' => $shop->showCart(),
            'ci' => $shop->changeQty((int) $a, 1),
            'cd' => $shop->changeQty((int) $a, -1),
            'cx' => $shop->clear(),
            'co' => $shop->startCheckout(),
            'st' => $ctx->state() === 'checkout_province' ? $shop->pickProvince($a.($b !== '' ? ':'.$b : '')) : null,
            'cy' => $ctx->state() === 'checkout_city' ? $shop->pickCity(substr($data, 3)) : null,
            'sm' => $ctx->state() === 'checkout_shipping' ? $shop->pickShipping((int) $a) : null,
            'cf' => $ctx->state() === 'checkout_confirm' ? $shop->placeOrder() : null,
            'cn' => $this->cancelCheckout($ctx),
            'pay' => $shop->pay((int) $a, (string) $b),
            'po' => ($o = $shop->ownOrder((int) $a)) ? $shop->paymentOptions($o) : null,
            'od' => $shop->orderDetail((int) $a),
            'unlink' => $shop->unlink(),
            'f' => $ctx->addon('faq') ? $addons->faqAnswer((int) $a) : null,
            'tn' => $ctx->addon('tickets') ? $addons->newTicket() : null,
            'tk' => $ctx->addon('tickets') ? $addons->showTicket((int) $a) : null,
            'tw' => $addons->startReply((int) $a),
            'lr' => $ctx->addon('loyalty') ? $addons->redeem((int) $a) : null,
            'daily' => $ctx->addon('loyalty') ? $addons->daily() : null,
            'ref' => $addons->referral(),
            // Admin
            'ao' => $admin->recentOrders(),
            'aod' => $admin->orderDetail((int) $a),
            'os' => $admin->setStatus((int) $a, (string) $b),
            'ac' => $admin->pendingC2c(),
            'ca' => $admin->decideC2c((int) $a, true),
            'cr' => $admin->decideC2c((int) $a, false),
            'at' => $admin->openTickets(),
            'tr' => $admin->startTicketReply((int) $a),
            'tc' => $admin->closeTicket((int) $a),
            default => null,
        };
    }

    private function cancelCheckout(BotContext $ctx): void
    {
        $ctx->setState('', []);
        (new class($ctx) extends BotFlow
        {
            public function go(): void
            {
                $this->send('ثبت سفارش لغو شد.', null, $this->mainMenu());
            }
        })->go();
    }
}
