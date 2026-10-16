<?php

namespace App\Services\Bots\Engine;

use App\Models\BotSession;
use App\Models\BotSetting;
use App\Services\Bots\BotClient;
use App\Services\Bots\BotClientFactory;

/**
 * Conversational router for Bale & Telegram webhooks
 * (port of WP bale-bot engine Router + MessageHandler + CallbackHandler; Telegram twin shares it).
 */
final class BotEngine
{
    public function handle(BotSetting $setting, array $update, ?BotClient $client = null): void
    {
        $client ??= $setting->token ? BotClientFactory::make((string) $setting->provider, (string) $setting->token) : null;
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

        if ($callback) {
            if ($client && ! empty($callback['id'])) {
                $client->call('answerCallbackQuery', ['callback_query_id' => (string) $callback['id']]);
            }
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
        $menu = BotFlow::MENU;

        if ($text === '/start' || str_starts_with($text, '/start ')) {
            $ctx->setState('', []);
            $this->welcome($ctx);
            $payload = trim(substr($text, 6));
            if (str_starts_with($payload, 'p_')) {
                $shop->product((int) substr($payload, 2));
            } elseif ($payload === 'cart') {
                $shop->showCart();
            }

            return;
        }

        // Contact share outside checkout = account linking.
        if (! empty($message['contact']) && $ctx->state() !== 'checkout_contact') {
            if ($user = $shop->linkContact((array) $message['contact'])) {
                $ctx->setState('', []);
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
        $isMenu = in_array($text, $menu, true);
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
            $text === $menu['store'] || $text === '/shop' => $shop->categories(),
            $text === $menu['search'] || $text === '/search' => $this->askSearch($ctx),
            $text === $menu['cart'] || $text === '/cart' => $shop->showCart(),
            $text === $menu['orders'] || $text === '/orders' => $shop->orders(),
            $text === $menu['account'] || $text === '/account' => $shop->account(),
            ($text === $menu['faq'] || $text === '/faq') && $ctx->addon('faq') => $addons->faq(),
            ($text === $menu['support'] || $text === '/support') && $ctx->addon('tickets') => $addons->support(),
            ($text === $menu['loyalty'] || $text === '/points') && $ctx->addon('loyalty') => $addons->loyalty(),
            $text === '/daily' && $ctx->addon('loyalty') => $addons->daily(),
            ($text === $menu['admin'] || $text === '/admin') && $ctx->isAdmin() => $admin->menu(),
            default => $this->fallback($ctx, $addons, $shop, $text),
        };
    }

    private function fallback(BotContext $ctx, AddonsFlow $addons, ShopFlow $shop, string $text): void
    {
        if ($text !== '' && $addons->matchFaq($text)) {
            return;
        }
        if (mb_strlen($text) >= 2 && ! str_starts_with($text, '/')) {
            // Treat free text as a product search (WP StoreFlow search fallback).
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
                $this->send($unknown ? $this->tpl('unknown') : $this->tpl('welcome', ['name' => $name, 'store' => $this->storeName()]), null, $this->mainMenu());
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
