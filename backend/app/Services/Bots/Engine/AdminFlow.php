<?php

namespace App\Services\Bots\Engine;

use App\Models\BotSession;
use App\Models\Order;
use App\Models\SupportTicket;
use App\Models\SupportTicketReply;
use App\Services\Orders\OrderShippingStatuses;
use App\Services\Orders\OrderStatusService;
use App\Services\Orders\OrderStatusTransitions;

/**
 * In-bot store admin (port of WP AdminFlow/AdminGate + bots-admin-ops).
 * Access only for chat ids listed in meta.admin_chat_ids.
 */
final class AdminFlow extends BotFlow
{
    public function menu(): void
    {
        if (! $this->ctx->isAdmin()) {
            $this->send($this->tpl('unknown'));

            return;
        }
        $tid = $this->ctx->tenantId();
        $today = now()->startOfDay();
        $todayOrders = Order::query()->where('tenant_id', $tid)->where('created_at', '>=', $today);
        $paid = (clone $todayOrders)->whereIn('status', ['paid', 'processing', 'completed', 'shipped', 'delivered'])->sum('total_minor');
        $pendingC2c = Order::query()->where('tenant_id', $tid)->where('c2c_status', 'pending')->whereIn('status', ['pending_payment', 'awaiting_gateway', 'on_hold'])->count();
        $openTickets = SupportTicket::query()->where('tenant_id', $tid)->whereIn('status', ['open', 'pending'])->count();
        $text = "🛠 پنل مدیریت ربات\n\nسفارش‌های امروز: ".(clone $todayOrders)->count()
            ."\nفروش پرداخت‌شدهٔ امروز: ".self::money((int) $paid)
            ."\nکارت‌به‌کارت در انتظار: ".$pendingC2c
            ."\nتیکت‌های باز: ".$openTickets;
        $this->send($text, [
            [['text' => '📦 سفارش‌های اخیر', 'callback_data' => 'ao'], ['text' => '🏦 کارت‌به‌کارت‌ها', 'callback_data' => 'ac']],
            [['text' => '🎫 تیکت‌های باز', 'callback_data' => 'at']],
        ]);
    }

    public function recentOrders(): void
    {
        if (! $this->ctx->isAdmin()) {
            return;
        }
        $orders = Order::query()->where('tenant_id', $this->ctx->tenantId())->orderByDesc('id')->limit(10)->get();
        if ($orders->isEmpty()) {
            $this->send('سفارشی ثبت نشده است.');

            return;
        }
        $rows = $orders->map(fn ($o) => [['text' => '#'.($o->number ?: $o->id).' '.OrderShippingStatuses::label((string) $o->status).' '.self::money((int) $o->total_minor, (string) $o->currency), 'callback_data' => 'aod:'.$o->id]])->all();
        $this->send('سفارش‌های اخیر:', $rows);
    }

    public function orderDetail(int $id): void
    {
        if (! $this->ctx->isAdmin()) {
            return;
        }
        $o = Order::query()->where('tenant_id', $this->ctx->tenantId())->with('items')->find($id);
        if (! $o) {
            return;
        }
        $text = 'سفارش #'.($o->number ?: $o->id)."\nمشتری: ".($o->customer_name ?: '—').' '.($o->customer_phone ?: '')
            ."\nوضعیت: ".OrderShippingStatuses::label((string) $o->status)."\nمبلغ: ".self::money((int) $o->total_minor, (string) $o->currency);
        foreach ($o->items as $it) {
            $text .= "\n• ".($it->product_name ?? '—').' × '.$it->quantity;
        }
        $kb = [];
        foreach (['processing' => 'در حال پردازش', 'completed' => 'تکمیل', 'cancelled' => 'لغو'] as $to => $label) {
            if (OrderStatusTransitions::canTransition((string) $o->status, $to)) {
                $kb[] = ['text' => $label, 'callback_data' => 'os:'.$o->id.':'.$to];
            }
        }
        $this->send($text, $kb ? [$kb] : null);
    }

    public function setStatus(int $id, string $to): void
    {
        if (! $this->ctx->isAdmin() || ! in_array($to, ['processing', 'completed', 'cancelled'], true)) {
            return;
        }
        $o = Order::query()->where('tenant_id', $this->ctx->tenantId())->find($id);
        if (! $o) {
            return;
        }
        $ok = app(OrderStatusService::class)->apply($o, $to);
        $this->send($ok ? '✅ وضعیت سفارش #'.($o->number ?: $o->id).' به «'.OrderShippingStatuses::label($to).'» تغییر کرد.' : 'این تغییر وضعیت مجاز نیست.');
    }

    public function pendingC2c(): void
    {
        if (! $this->ctx->isAdmin()) {
            return;
        }
        $orders = Order::query()->where('tenant_id', $this->ctx->tenantId())->where('c2c_status', 'pending')
            ->whereIn('status', ['pending_payment', 'awaiting_gateway', 'on_hold'])->orderBy('id')->limit(10)->get();
        if ($orders->isEmpty()) {
            $this->send('کارت‌به‌کارتی در انتظار تأیید نیست.');

            return;
        }
        foreach ($orders as $o) {
            $r = $o->meta['c2c_bot_receipt'] ?? [];
            $this->send('#'.($o->number ?: $o->id).' — '.self::money((int) $o->total_minor, (string) $o->currency).(! empty($r['ref']) ? "\nپیگیری: ".$r['ref'] : ''), $this->c2cButtons($o));
        }
    }

    private function c2cButtons(Order $o): array
    {
        return [[['text' => '✅ تأیید', 'callback_data' => 'ca:'.$o->id], ['text' => '❌ رد', 'callback_data' => 'cr:'.$o->id]]];
    }

    /** Push a fresh receipt to every admin chat (WP bots-c2c-gateway). */
    public function notifyC2c(Order $order, string $fileId, string $ref): void
    {
        $text = "🏦 رسید کارت‌به‌کارت جدید\nسفارش #".($order->number ?: $order->id).' — '.self::money((int) $order->total_minor, (string) $order->currency)
            ."\nمشتری: ".($order->customer_name ?: '—').' '.($order->customer_phone ?: '').($ref !== '' ? "\nپیگیری: ".$ref : '');
        foreach (self::adminChats($this->ctx->meta()) as $chat) {
            $payload = ['chat_id' => $chat, 'reply_markup' => ['inline_keyboard' => $this->c2cButtons($order)]];
            if ($fileId !== '') {
                BotMessenger::call($this->ctx->tenantId(), $this->ctx->provider(), $this->ctx->client, 'sendPhoto', $payload + ['photo' => $fileId, 'caption' => $text]);
            } else {
                BotMessenger::call($this->ctx->tenantId(), $this->ctx->provider(), $this->ctx->client, 'sendMessage', $payload + ['text' => $text]);
            }
        }
    }

    public function decideC2c(int $id, bool $approve): void
    {
        if (! $this->ctx->isAdmin()) {
            return;
        }
        $o = Order::query()->where('tenant_id', $this->ctx->tenantId())->find($id);
        if (! $o || $o->c2c_status !== 'pending') {
            $this->send('این سفارش قبلاً بررسی شده است.');

            return;
        }
        $stamp = ['c2c_decided_at' => now()];
        $ok = $approve
            ? app(OrderStatusService::class)->apply($o, 'paid', $stamp + ['c2c_status' => 'approved', 'amount_paid_minor' => (int) $o->total_minor])
            : app(OrderStatusService::class)->apply($o, 'failed', $stamp + ['c2c_status' => 'rejected']);
        $this->send($ok ? ($approve ? '✅ پرداخت تأیید شد.' : '❌ پرداخت رد شد.') : 'تغییر وضعیت ممکن نشد.');
        if ($ok && ! $approve) {
            BotNotifier::toOrderCustomer($o->fresh(), '❌ رسید کارت‌به‌کارت سفارش #'.($o->number ?: $o->id).' تأیید نشد. برای پیگیری با پشتیبانی در تماس باشید.');
        }
    }

    public function openTickets(): void
    {
        if (! $this->ctx->isAdmin()) {
            return;
        }
        $rows = SupportTicket::query()->where('tenant_id', $this->ctx->tenantId())->whereIn('status', ['open', 'pending'])->orderByDesc('updated_at')->limit(10)->get();
        if ($rows->isEmpty()) {
            $this->send('تیکت بازی وجود ندارد.');

            return;
        }
        foreach ($rows as $t) {
            $last = SupportTicketReply::query()->where('ticket_id', $t->id)->orderByDesc('id')->value('body');
            $this->send('🎫 #'.$t->id.' '.$t->subject."\n".\Illuminate\Support\Str::limit((string) $last, 300), [[['text' => '✍️ پاسخ', 'callback_data' => 'tr:'.$t->id], ['text' => '✔️ بستن', 'callback_data' => 'tc:'.$t->id]]]);
        }
    }

    public function startTicketReply(int $id): void
    {
        if (! $this->ctx->isAdmin()) {
            return;
        }
        $this->ctx->setState('admin_ticket_reply', ['ticket_id' => $id]);
        $this->send('پاسخ تیکت #'.$id.' را بنویسید (انصراف: /cancel):');
    }

    public function ticketReply(string $text): void
    {
        $id = (int) ($this->ctx->draft()['ticket_id'] ?? 0);
        $this->ctx->setState('', []);
        $t = SupportTicket::query()->where('tenant_id', $this->ctx->tenantId())->find($id);
        if (! $t || $text === '/cancel') {
            $this->send('لغو شد.');

            return;
        }
        $staffId = \App\Models\User::query()->where('tenant_id', $t->tenant_id)->whereKey($this->ctx->session->user_id)->where('role', '!=', 'customer')->value('id')
            ?? \App\Models\User::query()->where('tenant_id', $t->tenant_id)->where('role', '!=', 'customer')->orderBy('id')->value('id');
        if (! $staffId) {
            $this->send('کاربر مدیری برای ثبت پاسخ پیدا نشد.');

            return;
        }
        SupportTicketReply::query()->create(['tenant_id' => $t->tenant_id, 'ticket_id' => $t->id, 'user_id' => $staffId, 'is_staff' => true, 'body' => $text]);
        $t->update(['status' => 'answered']);
        BotNotifier::ticketReply($t, $text);
        $this->send('✅ پاسخ ثبت و برای مشتری ارسال شد.');
    }

    public function closeTicket(int $id): void
    {
        if (! $this->ctx->isAdmin()) {
            return;
        }
        SupportTicket::query()->where('tenant_id', $this->ctx->tenantId())->whereKey($id)->update(['status' => 'closed']);
        $this->send('تیکت #'.$id.' بسته شد.');
    }

    /** @return list<string> */
    public static function adminChats(array $meta): array
    {
        $ids = $meta['admin_chat_ids'] ?? [];
        if (is_string($ids)) {
            $ids = preg_split('/[\s,]+/', $ids) ?: [];
        }

        return array_values(array_filter(array_map('strval', (array) $ids), fn ($v) => $v !== ''));
    }
}
