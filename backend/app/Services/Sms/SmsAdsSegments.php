<?php

namespace App\Services\Sms;

use App\Models\Cart;
use App\Models\Order;
use App\Models\SmsNewsletterSubscriber;
use App\Models\User;
use App\Services\Shop\ShopSettings;
use Illuminate\Support\Carbon;

/**
 * Resolve local store audiences for SMS ad campaigns (WP parity).
 */
class SmsAdsSegments
{
    public const CAP = 5000;

    /** @return array<string, string> */
    public static function segmentKeys(): array
    {
        return [
            'system_suggest' => 'system_suggest',
            'retarget' => 'retarget',
            'acquire' => 'acquire',
            'city_customers' => 'city_customers',
            'all_city' => 'all_city',
            'vip_buyers' => 'vip_buyers',
            'followers' => 'followers',
        ];
    }

    public function __construct(protected SmsLocalFeatures $sms) {}

    /**
     * @param  array{include_phones?: bool, limit?: int}  $opts
     * @return array{count: int, sample: list<array{phone: string, name?: string}>, phones?: list<string>}
     */
    public function resolve(int $tenantId, string $segment, array $opts = []): array
    {
        if (! isset(self::segmentKeys()[$segment])) {
            return ['count' => 0, 'sample' => []];
        }

        $includePhones = ! empty($opts['include_phones']);
        $limit = isset($opts['limit']) ? max(1, min(self::CAP, (int) $opts['limit'])) : self::CAP;

        $map = match ($segment) {
            'system_suggest' => $this->merge(
                $this->phonesAbandonCandidates($tenantId),
                $this->phonesCategoryAffinity($tenantId),
            ),
            'retarget' => $this->phonesPastCustomers($tenantId, 30),
            'acquire' => $this->phonesAcquire($tenantId),
            'city_customers' => $this->phonesCity($tenantId, true),
            'all_city' => $this->phonesCity($tenantId, false),
            'vip_buyers' => $this->phonesVip($tenantId, 3),
            'followers' => $this->phonesFollowers($tenantId),
            default => [],
        };

        $phones = array_slice(array_keys($map), 0, $limit);
        $sample = [];
        foreach (array_slice($phones, 0, 5) as $p) {
            $sample[] = ['phone' => $p, 'name' => (string) ($map[$p] ?? '')];
        }

        $out = ['count' => count($phones), 'sample' => $sample];
        if ($includePhones) {
            $out['phones'] = $phones;
        }

        return $out;
    }

    /** @param  array<string, string>  ...$maps */
    protected function merge(array ...$maps): array
    {
        $out = [];
        foreach ($maps as $map) {
            foreach ($map as $phone => $name) {
                if ($phone !== '' && ! isset($out[$phone])) {
                    $out[$phone] = $name;
                }
            }
        }

        return $out;
    }

    protected function normalize(?string $raw): string
    {
        if ($raw === null || $raw === '') {
            return '';
        }
        $n = $this->sms->normalizePhone($raw);

        return $n && preg_match('/^09\d{9}$/', $n) ? $n : '';
    }

    /** @return array<string, string> */
    protected function phonesAbandonCandidates(int $tenantId): array
    {
        $out = [];
        $since = Carbon::now()->subDays(14);
        $orders = Order::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('status', ['pending_payment', 'awaiting_gateway', 'on_hold', 'payment_failed'])
            ->where('created_at', '>=', $since)
            ->orderByDesc('id')
            ->limit(400)
            ->get(['customer_phone', 'customer_name', 'billing_address', 'user_id']);

        foreach ($orders as $order) {
            $phone = $this->phoneFromOrder($order);
            if ($phone === '') {
                continue;
            }
            $out[$phone] = $this->nameFromOrder($order);
        }

        $cartUserIds = Cart::query()
            ->where('tenant_id', $tenantId)
            ->whereNotNull('user_id')
            ->where('updated_at', '>=', $since)
            ->pluck('user_id')
            ->unique()
            ->take(300);
        if ($cartUserIds->isNotEmpty()) {
            $users = User::query()->where('tenant_id', $tenantId)->whereIn('id', $cartUserIds)->get(['id', 'name', 'phone', 'first_name', 'last_name']);
            foreach ($users as $u) {
                $phone = $this->normalize((string) ($u->phone ?? ''));
                if ($phone === '') {
                    continue;
                }
                $out[$phone] = trim((string) (($u->first_name ?? '').' '.($u->last_name ?? ''))) ?: (string) ($u->name ?? '');
            }
        }

        return $out;
    }

    /** @return array<string, string> */
    protected function phonesCategoryAffinity(int $tenantId): array
    {
        $out = [];
        $orders = Order::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('status', ['paid', 'processing', 'shipped', 'completed'])
            ->orderByDesc('id')
            ->limit(200)
            ->get(['customer_phone', 'customer_name', 'billing_address', 'user_id']);
        foreach ($orders as $order) {
            $phone = $this->phoneFromOrder($order);
            if ($phone !== '') {
                $out[$phone] = $this->nameFromOrder($order);
            }
        }

        return $out;
    }

    /** @return array<string, string> */
    protected function phonesPastCustomers(int $tenantId, int $days = 30): array
    {
        $cutoff = Carbon::now()->subDays(max(1, $days))->getTimestamp();
        $latest = [];
        $orders = Order::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('status', ['paid', 'processing', 'shipped', 'completed'])
            ->orderByDesc('id')
            ->limit(800)
            ->get(['customer_phone', 'customer_name', 'billing_address', 'user_id', 'created_at']);
        foreach ($orders as $order) {
            $phone = $this->phoneFromOrder($order);
            if ($phone === '') {
                continue;
            }
            $ts = $order->created_at?->getTimestamp() ?? 0;
            if (! isset($latest[$phone]) || $ts > $latest[$phone]['ts']) {
                $latest[$phone] = ['ts' => $ts, 'name' => $this->nameFromOrder($order)];
            }
        }
        $out = [];
        foreach ($latest as $phone => $row) {
            if ((int) $row['ts'] <= $cutoff) {
                $out[$phone] = (string) $row['name'];
            }
        }

        return $out;
    }

    /** @return array<string, string> */
    protected function phonesAcquire(int $tenantId): array
    {
        $buyerPhones = [];
        $orders = Order::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('status', ['paid', 'processing', 'shipped', 'completed'])
            ->orderByDesc('id')
            ->limit(2000)
            ->get(['customer_phone', 'billing_address', 'user_id']);
        foreach ($orders as $order) {
            $phone = $this->phoneFromOrder($order);
            if ($phone !== '') {
                $buyerPhones[$phone] = true;
            }
        }

        $out = [];
        $subs = SmsNewsletterSubscriber::query()
            ->where('tenant_id', $tenantId)
            ->orderByDesc('id')
            ->limit(2000)
            ->get(['phone']);
        foreach ($subs as $sub) {
            $phone = $this->normalize((string) $sub->phone);
            if ($phone === '' || isset($buyerPhones[$phone])) {
                continue;
            }
            $out[$phone] = '';
        }

        return $out;
    }

    /** @return array<string, string> */
    protected function phonesCity(int $tenantId, bool $purchasersOnly): array
    {
        $storeCity = mb_strtolower(trim((string) (ShopSettings::getGeneral($tenantId)['store_address']['city'] ?? '')));
        if ($storeCity === '') {
            return [];
        }

        $out = [];
        $query = Order::query()->where('tenant_id', $tenantId)->orderByDesc('id')->limit(1500);
        if ($purchasersOnly) {
            $query->whereIn('status', ['paid', 'processing', 'shipped', 'completed']);
        }
        foreach ($query->get(['customer_phone', 'customer_name', 'billing_address', 'shipping_address', 'user_id']) as $order) {
            $city = $this->cityFromOrder($order);
            if ($city === '' || mb_strtolower($city) !== $storeCity) {
                continue;
            }
            $phone = $this->phoneFromOrder($order);
            if ($phone !== '') {
                $out[$phone] = $this->nameFromOrder($order);
            }
        }

        if (! $purchasersOnly) {
            $users = User::query()->where('tenant_id', $tenantId)->orderByDesc('id')->limit(800)->get(['phone', 'name', 'first_name', 'last_name', 'addresses']);
            foreach ($users as $u) {
                $phone = $this->normalize((string) ($u->phone ?? ''));
                if ($phone === '') {
                    continue;
                }
                $city = '';
                $addrs = is_array($u->addresses) ? $u->addresses : [];
                foreach ($addrs as $a) {
                    if (is_array($a) && ! empty($a['city'])) {
                        $city = (string) $a['city'];
                        break;
                    }
                }
                if ($city === '' || mb_strtolower(trim($city)) !== $storeCity) {
                    continue;
                }
                $out[$phone] = trim((string) (($u->first_name ?? '').' '.($u->last_name ?? ''))) ?: (string) ($u->name ?? '');
            }
        }

        return $out;
    }

    /** @return array<string, string> */
    protected function phonesVip(int $tenantId, int $minOrders = 3): array
    {
        $counts = [];
        $names = [];
        $orders = Order::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('status', ['paid', 'processing', 'shipped', 'completed'])
            ->orderByDesc('id')
            ->limit(2000)
            ->get(['customer_phone', 'customer_name', 'billing_address', 'user_id']);
        foreach ($orders as $order) {
            $phone = $this->phoneFromOrder($order);
            if ($phone === '') {
                continue;
            }
            $counts[$phone] = ($counts[$phone] ?? 0) + 1;
            $names[$phone] = $this->nameFromOrder($order);
        }
        $out = [];
        foreach ($counts as $phone => $n) {
            if ($n >= $minOrders) {
                $out[$phone] = (string) ($names[$phone] ?? '');
            }
        }

        return $out;
    }

    /** @return array<string, string> */
    protected function phonesFollowers(int $tenantId): array
    {
        $out = [];
        $subs = SmsNewsletterSubscriber::query()
            ->where('tenant_id', $tenantId)
            ->orderByDesc('id')
            ->limit(3000)
            ->get(['phone']);
        foreach ($subs as $sub) {
            $phone = $this->normalize((string) $sub->phone);
            if ($phone !== '') {
                $out[$phone] = '';
            }
        }

        return $out;
    }

    protected function phoneFromOrder(Order $order): string
    {
        $phone = $this->normalize((string) ($order->customer_phone ?? ''));
        if ($phone !== '') {
            return $phone;
        }
        $billing = is_array($order->billing_address) ? $order->billing_address : [];
        $phone = $this->normalize((string) ($billing['phone'] ?? $billing['mobile'] ?? ''));
        if ($phone !== '') {
            return $phone;
        }
        if ($order->user_id) {
            $u = User::query()->find($order->user_id);
            if ($u) {
                return $this->normalize((string) ($u->phone ?? ''));
            }
        }

        return '';
    }

    protected function nameFromOrder(Order $order): string
    {
        $name = trim((string) ($order->customer_name ?? ''));
        if ($name !== '') {
            return $name;
        }
        $billing = is_array($order->billing_address) ? $order->billing_address : [];

        return trim((string) (($billing['first_name'] ?? '').' '.($billing['last_name'] ?? '')))
            ?: (string) ($billing['name'] ?? '');
    }

    protected function cityFromOrder(Order $order): string
    {
        foreach ([$order->billing_address, $order->shipping_address] as $addr) {
            if (is_array($addr) && ! empty($addr['city'])) {
                return (string) $addr['city'];
            }
        }

        return '';
    }
}
