<?php

namespace App\Services\Marketing;

use App\Models\BotSession;
use App\Models\BotSetting;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Coupon;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Auth\OtpSettings;
use App\Services\Bots\Engine\BotFlow;
use App\Services\Bots\Engine\BotMessenger;
use App\Services\Coupons\CouponService;
use App\Services\Marketplace\Basalam\BasalamAuth;
use App\Services\Modules\ModuleSettingsService;
use App\Services\Sms\ModirPayamakClient;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Multi-stage abandoned-cart recovery via bot + SMS
 * (port of WP bale/telegram Woo/AbandonedCartService + sms-panel sms-recovery).
 * SMS is sent through ERP/ModirPayamak (same path as NotificationDispatcher).
 */
final class AbandonedCartService
{
    public const MODULE = 'marketing';

    public const KEY = 'abandoned_cart';

    /** @return array<string, mixed> */
    public static function defaults(): array
    {
        return [
            'enabled' => false,
            'channels' => ['bot' => true, 'sms' => false],
            'min_subtotal' => 0,
            'stages' => [
                ['delay_hours' => 2, 'message' => "سلام {name} 👋\nچند کالا در سبد خرید {store} جا مانده است ({total}).\nبرای تکمیل خرید: {cart_url}", 'coupon_type' => 'none', 'coupon_amount' => 0, 'coupon_expires_days' => 3],
                ['delay_hours' => 24, 'message' => "{name} عزیز، سبد خرید شما هنوز منتظر است.\nکد تخفیف {coupon} مخصوص شماست.\n{cart_url}", 'coupon_type' => 'percent', 'coupon_amount' => 0, 'coupon_expires_days' => 3],
                ['delay_hours' => 72, 'message' => "آخرین یادآوری: سبد خرید شما در {store} تا چند روز دیگر نگه داشته می‌شود.\n{cart_url}", 'coupon_type' => 'none', 'coupon_amount' => 0, 'coupon_expires_days' => 3],
            ],
        ];
    }

    /** @return array<string, mixed> */
    public static function get(int $tenantId): array
    {
        $stored = app(ModuleSettingsService::class)->get($tenantId, self::MODULE, self::KEY, []);
        $merged = array_replace(self::defaults(), is_array($stored) ? $stored : []);
        $merged['channels'] = array_replace(self::defaults()['channels'], (array) ($merged['channels'] ?? []));

        return $merged;
    }

    /** @return array<string, mixed> */
    public static function save(int $tenantId, array $in): array
    {
        $stages = [];
        foreach (array_slice((array) ($in['stages'] ?? []), 0, 3) as $s) {
            if (! is_array($s)) {
                continue;
            }
            $type = in_array($s['coupon_type'] ?? 'none', ['none', 'percent', 'fixed'], true) ? $s['coupon_type'] : 'none';
            $stages[] = [
                'delay_hours' => max(1, min(720, (int) ($s['delay_hours'] ?? 24))),
                'message' => mb_substr(trim((string) ($s['message'] ?? '')), 0, 1000),
                'coupon_type' => $type,
                'coupon_amount' => max(0, (int) ($s['coupon_amount'] ?? 0)),
                'coupon_expires_days' => max(1, min(90, (int) ($s['coupon_expires_days'] ?? 3))),
            ];
        }
        $clean = [
            'enabled' => (bool) ($in['enabled'] ?? false),
            'channels' => ['bot' => (bool) ($in['channels']['bot'] ?? true), 'sms' => (bool) ($in['channels']['sms'] ?? false)],
            'min_subtotal' => max(0, (int) ($in['min_subtotal'] ?? 0)),
            'stages' => $stages ?: self::defaults()['stages'],
        ];
        app(ModuleSettingsService::class)->put($tenantId, self::MODULE, self::KEY, $clean);

        return $clean;
    }

    public static function lastActivity(Cart $cart): ?Carbon
    {
        $itemMax = CartItem::query()->where('cart_id', $cart->id)->max('updated_at');
        $times = array_filter([$cart->updated_at, $itemMax ? Carbon::parse($itemMax) : null]);

        return $times ? max($times) : null;
    }

    /** Run for all tenants with recovery enabled. Returns number of reminders sent. */
    public function run(?int $onlyTenant = null): int
    {
        $sent = 0;
        $tenantIds = $onlyTenant ? [$onlyTenant] : DB::table('carts')->whereExists(fn ($q) => $q->from('cart_items')->whereColumn('cart_items.cart_id', 'carts.id'))->distinct()->pluck('tenant_id')->all();
        foreach ($tenantIds as $tid) {
            $cfg = self::get((int) $tid);
            if (empty($cfg['enabled'])) {
                continue;
            }
            $sent += $this->runTenant((int) $tid, $cfg);
        }

        return $sent;
    }

    private function runTenant(int $tid, array $cfg): int
    {
        $stages = array_values((array) $cfg['stages']);
        if ($stages === []) {
            return 0;
        }
        $firstDelay = (int) $stages[0]['delay_hours'];
        $sent = 0;
        $carts = Cart::query()->where('tenant_id', $tid)
            ->whereNull('table_number') // cafe dine-in carts are not "abandoned"
            ->whereExists(fn ($q) => $q->from('cart_items')->whereColumn('cart_items.cart_id', 'carts.id'))
            ->where('updated_at', '>=', now()->subDays(14))
            ->limit(500)->get();
        foreach ($carts as $cart) {
            $activity = self::lastActivity($cart);
            if (! $activity || $activity->gt(now()->subHours($firstDelay))) {
                continue;
            }
            $meta = is_array($cart->meta) ? $cart->meta : [];
            $stage = (int) ($meta['recovery_stage'] ?? 0);
            // Customer touched the cart after our last reminder → start over.
            if (! empty($meta['recovery_activity']) && $meta['recovery_activity'] !== $activity->toIso8601String()) {
                $stage = 0;
            }
            if ($stage >= count($stages)) {
                continue;
            }
            $st = $stages[$stage];
            if ($activity->gt(now()->subHours((int) $st['delay_hours']))) {
                continue;
            }
            if ($this->remind($tid, $cart, $st, $cfg)) {
                $sent++;
            }
            // Advance even if no channel reached the customer, so we don't retry every tick.
            $meta['recovery_stage'] = $stage + 1;
            $meta['recovery_activity'] = $activity->toIso8601String();
            $meta['recovery_last_at'] = now()->toIso8601String();
            $cart->meta = $meta;
            $cart->timestamps = false; // don't count our own write as customer activity
            $cart->save();
        }

        return $sent;
    }

    private function remind(int $tid, Cart $cart, array $stage, array $cfg): bool
    {
        $lines = CartItem::query()->where('cart_id', $cart->id)->with('product')->get()->filter(fn ($l) => $l->product !== null);
        if ($lines->isEmpty()) {
            return false;
        }
        $subtotal = (int) $lines->sum(fn ($l) => $l->product->storefrontPriceMinor() * $l->quantity);
        if ($subtotal < (int) ($cfg['min_subtotal'] ?? 0)) {
            return false;
        }
        $currency = (string) ($lines->first()->product->currency ?: 'IRT');
        $user = $cart->user_id ? User::query()->find($cart->user_id) : null;
        $tenant = Tenant::query()->find($tid);
        $coupon = '';
        if (($stage['coupon_type'] ?? 'none') !== 'none' && (int) ($stage['coupon_amount'] ?? 0) > 0) {
            $coupon = $this->coupon($tid, $stage, $user);
        }
        $vars = [
            '{name}' => $user?->name && $user->name !== $user->phone ? $user->name : 'مشتری',
            '{store}' => (string) ($tenant?->store_display_name ?: $tenant?->name ?: ''),
            '{total}' => BotFlow::money($subtotal, $currency),
            '{cart_url}' => BasalamAuth::siteUrl($tid).'/cart',
            '{coupon}' => $coupon !== '' ? $coupon : 'ندارد',
            '{items}' => (string) $lines->count(),
        ];
        $text = strtr((string) ($stage['message'] ?: self::defaults()['stages'][0]['message']), $vars);
        $ok = false;

        if (! empty($cfg['channels']['bot'])) {
            foreach ($this->botTargets($tid, $cart) as $t) {
                $payload = ['chat_id' => $t['chat_id'], 'text' => $text, 'reply_markup' => ['inline_keyboard' => [[['text' => '🛒 تکمیل خرید', 'callback_data' => 'cart']]]]];
                $res = BotMessenger::call($tid, $t['provider'], null, 'sendMessage', $payload);
                $ok = $ok || ! empty($res['ok']);
            }
        }
        if (! empty($cfg['channels']['sms']) && $tenant && $user?->phone) {
            $body = ['message' => $text, 'recipients' => [(string) $user->phone]];
            $from = (string) (OtpSettings::forTenant($tid, app(ModuleSettingsService::class))['sender_line_service'] ?? '');
            if ($from !== '') {
                $body['from_number'] = $from;
            }
            $res = app(ModirPayamakClient::class)->post($tenant, 'send', $body);
            $ok = $ok || (! empty($res['ok']) && empty($res['data']['unavailable']));
        }

        return $ok;
    }

    /** @return list<array{provider: string, chat_id: string}> */
    private function botTargets(int $tid, Cart $cart): array
    {
        $enabled = BotSetting::query()->where('tenant_id', $tid)->where('enabled', true)->pluck('provider')->all();
        $out = [];
        $meta = is_array($cart->meta) ? $cart->meta : [];
        if (! empty($meta['bot_provider']) && ! empty($meta['bot_chat_id'])) {
            $out[$meta['bot_provider'].':'.$meta['bot_chat_id']] = ['provider' => (string) $meta['bot_provider'], 'chat_id' => (string) $meta['bot_chat_id']];
        }
        if ($cart->user_id) {
            foreach (BotSession::query()->where('tenant_id', $tid)->where('user_id', $cart->user_id)->get() as $s) {
                $out[$s->provider.':'.$s->chat_id] = ['provider' => (string) $s->provider, 'chat_id' => (string) $s->chat_id];
            }
        }

        return array_values(array_filter($out, fn ($t) => in_array($t['provider'], $enabled, true)));
    }

    private function coupon(int $tid, array $stage, ?User $user): string
    {
        $code = app(CouponService::class)->generateCode($tid, 8);
        Coupon::query()->create([
            'tenant_id' => $tid,
            'code' => $code,
            'type' => $stage['coupon_type'] === 'fixed' ? 'fixed' : 'percent',
            'amount' => (int) $stage['coupon_amount'],
            'usage_limit' => 1,
            'usage_limit_per_user' => 1,
            'expires_at' => now()->addDays((int) ($stage['coupon_expires_days'] ?? 3)),
            'status' => 'publish',
            'description' => 'بازیابی سبد رهاشده',
            'restrictions' => $user?->email ? ['email' => $user->email] : [],
        ]);

        return $code;
    }

    /** Admin list: carts that are/were in recovery. */
    public function report(int $tid): array
    {
        $rows = Cart::query()->where('tenant_id', $tid)
            ->whereExists(fn ($q) => $q->from('cart_items')->whereColumn('cart_items.cart_id', 'carts.id'))
            ->orderByDesc('updated_at')->limit(100)->get();

        return $rows->map(function ($c) {
            $lines = CartItem::query()->where('cart_id', $c->id)->with('product')->get()->filter(fn ($l) => $l->product !== null);

            return [
                'id' => $c->id,
                'user' => $c->user_id ? User::query()->whereKey($c->user_id)->first(['id', 'name', 'phone']) : null,
                'channel' => ! empty($c->meta['bot_provider']) ? $c->meta['bot_provider'] : 'site',
                'items' => $lines->count(),
                'subtotal_minor' => (int) $lines->sum(fn ($l) => $l->product->storefrontPriceMinor() * $l->quantity),
                'last_activity' => self::lastActivity($c)?->toIso8601String(),
                'recovery_stage' => (int) ($c->meta['recovery_stage'] ?? 0),
                'recovery_last_at' => $c->meta['recovery_last_at'] ?? null,
            ];
        })->values()->all();
    }
}
