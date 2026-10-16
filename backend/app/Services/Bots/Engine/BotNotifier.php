<?php

namespace App\Services\Bots\Engine;

use App\Models\BotSession;
use App\Models\BotSetting;
use App\Models\Order;
use App\Models\SupportTicket;
use App\Services\Orders\OrderShippingStatuses;
use Illuminate\Support\Str;

/**
 * Proactive bot messages: stepped order-status cascade (WP bots-notify-cascade / order-notify),
 * payment confirmation, ticket replies. All sends go through BotMessenger (logged + retry queue).
 */
final class BotNotifier
{
    /** @return \Illuminate\Support\Collection<int, BotSetting> */
    private static function enabledBots(int $tenantId)
    {
        return BotSetting::query()->where('tenant_id', $tenantId)->where('enabled', true)->get()->filter(fn ($s) => filled($s->token));
    }

    /** @return list<array{provider: string, chat_id: string}> */
    private static function customerChats(Order $order): array
    {
        $out = [];
        $bot = $order->meta['bot'] ?? null;
        if (is_array($bot) && ! empty($bot['provider']) && ! empty($bot['chat_id'])) {
            $out[$bot['provider'].':'.$bot['chat_id']] = ['provider' => (string) $bot['provider'], 'chat_id' => (string) $bot['chat_id']];
        }
        if ($order->user_id) {
            BotSession::query()->where('tenant_id', $order->tenant_id)->where('user_id', $order->user_id)->get()
                ->each(function ($s) use (&$out) {
                    $out[$s->provider.':'.$s->chat_id] = ['provider' => (string) $s->provider, 'chat_id' => (string) $s->chat_id];
                });
        }

        return array_values($out);
    }

    public static function toOrderCustomer(Order $order, string $text): int
    {
        $sent = 0;
        $enabled = self::enabledBots((int) $order->tenant_id)->keyBy('provider');
        foreach (self::customerChats($order) as $c) {
            if (! $enabled->has($c['provider'])) {
                continue;
            }
            $res = BotMessenger::call((int) $order->tenant_id, $c['provider'], null, 'sendMessage', ['chat_id' => $c['chat_id'], 'text' => $text]);
            $sent += ! empty($res['ok']) ? 1 : 0;
        }

        return $sent;
    }

    public static function render(string $template, Order $order, string $to): string
    {
        return strtr($template, [
            '{order_number}' => (string) ($order->number ?: $order->id),
            '{order_id}' => (string) $order->id,
            '{status_label}' => OrderShippingStatuses::label($to),
            '{tracking_code}' => (string) ($order->trackingCode() ?? ''),
            '{total}' => BotFlow::money((int) $order->total_minor, (string) ($order->currency ?: 'IRT')),
            '{customer_name}' => (string) ($order->customer_name ?? ''),
        ]);
    }

    /** Called from OrderStatusObserver after every status change. */
    public static function orderStatus(Order $order, string $from, string $to): void
    {
        $bots = self::enabledBots((int) $order->tenant_id);
        if ($bots->isEmpty()) {
            return;
        }
        $fromBot = is_array($order->meta['bot'] ?? null);
        $customerDone = false;
        foreach ($bots as $setting) {
            $meta = is_array($setting->meta) ? $setting->meta : [];
            $cascadeOn = ! empty($meta['addons']['order_cascade']);
            $cascade = is_array($meta['cascade'] ?? null) ? $meta['cascade'] : [];
            $statuses = $cascade['statuses'] ?? 'processing,completed';
            $statuses = is_array($statuses) ? $statuses : array_filter(array_map('trim', explode(',', (string) $statuses)));
            $template = trim((string) ($cascade['template'] ?? '')) ?: "📦 سفارش #{order_number}\nوضعیت جدید: {status_label}";
            $inCascade = $cascadeOn && in_array($to, $statuses, true);

            // Admin step notifications.
            if ($inCascade || ($cascadeOn && $to === 'paid')) {
                foreach (AdminFlow::adminChats($meta) as $chat) {
                    BotMessenger::call((int) $order->tenant_id, (string) $setting->provider, null, 'sendMessage', [
                        'chat_id' => $chat,
                        'text' => '🔔 سفارش #'.($order->number ?: $order->id).': '.OrderShippingStatuses::label($from).' ← '.OrderShippingStatuses::label($to)
                            .' — '.BotFlow::money((int) $order->total_minor, (string) ($order->currency ?: 'IRT')),
                        'reply_markup' => ['inline_keyboard' => [[['text' => 'جزئیات', 'callback_data' => 'aod:'.$order->id]]]],
                    ]);
                }
            }
            if ($customerDone) {
                continue;
            }
            $notifyCustomer = ! array_key_exists('notify_customer', $cascade) || ! empty($cascade['notify_customer']);
            if ($inCascade && $notifyCustomer) {
                $text = self::render($template, $order, $to);
                if ($order->trackingCode() && ! str_contains($template, '{tracking_code}')) {
                    $text .= "\nکد رهگیری: ".$order->trackingCode();
                }
                self::toOrderCustomer($order, $text);
                $customerDone = true;
            } elseif ($fromBot && in_array($to, ['paid', 'failed'], true)) {
                // Payment result for orders placed inside the bot is always confirmed.
                $tpl = $to === 'paid'
                    ? (string) (($meta['templates']['paid'] ?? '') ?: BotFlow::DEFAULT_TEMPLATES['paid'])
                    : '⚠️ پرداخت سفارش #{order_number} ناموفق بود.';
                self::toOrderCustomer($order, self::render($tpl, $order, $to));
                $customerDone = true;
            }
        }
    }

    public static function newOrderToAdmins(Order $order, BotContext $ctx): void
    {
        foreach (AdminFlow::adminChats($ctx->meta()) as $chat) {
            BotMessenger::call($ctx->tenantId(), $ctx->provider(), $ctx->client, 'sendMessage', [
                'chat_id' => $chat,
                'text' => '🆕 سفارش جدید از ربات #'.($order->number ?: $order->id).' — '.BotFlow::money((int) $order->total_minor, (string) ($order->currency ?: 'IRT')).' — '.($order->customer_name ?: ''),
                'reply_markup' => ['inline_keyboard' => [[['text' => 'جزئیات', 'callback_data' => 'aod:'.$order->id]]]],
            ]);
        }
    }

    public static function ticketReply(SupportTicket $ticket, string $body): int
    {
        $sent = 0;
        $enabled = self::enabledBots((int) $ticket->tenant_id)->keyBy('provider');
        $sessions = BotSession::query()->where('tenant_id', $ticket->tenant_id)->where('user_id', $ticket->user_id)->get();
        foreach ($sessions as $s) {
            if (! $enabled->has($s->provider)) {
                continue;
            }
            $res = BotMessenger::call((int) $ticket->tenant_id, (string) $s->provider, null, 'sendMessage', [
                'chat_id' => (string) $s->chat_id,
                'text' => '👨‍💼 پاسخ پشتیبانی به تیکت #'.$ticket->id.' ('.$ticket->subject.")\n\n".Str::limit(strip_tags($body), 3500),
                'reply_markup' => ['inline_keyboard' => [[['text' => '✍️ ارسال پاسخ', 'callback_data' => 'tw:'.$ticket->id]]]],
            ]);
            $sent += ! empty($res['ok']) ? 1 : 0;
        }

        return $sent;
    }
}
