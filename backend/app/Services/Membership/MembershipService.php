<?php

namespace App\Services\Membership;

use App\Models\MembershipEntitlement;
use App\Models\Product;
use App\Models\User;
use App\Services\Modules\ModuleSettingsService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Tenant-configurable premium membership (plans, active entitlement, product discount).
 * Plans live in module settings `site.membership` so every site can customize later.
 */
final class MembershipService
{
    public const SETTINGS_KEY = 'site.membership';

    /** @return array<string, mixed> */
    public static function defaults(): array
    {
        return [
            'enabled' => true,
            'title' => 'حساب کاربری ویژه',
            'free_audio_downloads' => 5,
            'product_discount_percent' => 10,
            'plans' => [
                ['id' => '1m', 'label' => 'یک‌ماهه', 'months' => 1, 'price_minor' => 189000, 'enabled' => true],
                ['id' => '3m', 'label' => 'سه‌ماهه', 'months' => 3, 'price_minor' => 299000, 'enabled' => true],
                ['id' => '6m', 'label' => 'شش‌ماهه', 'months' => 6, 'price_minor' => 459000, 'enabled' => true],
                ['id' => '12m', 'label' => 'یک‌ساله', 'months' => 12, 'price_minor' => 889000, 'enabled' => true],
            ],
            'benefits' => [
                'دسترسی به تمام اشعار ویژه',
                'دانلود نامحدود صوت و ویدیو',
                '۱۰٪ تخفیف روی همه محصولات',
            ],
        ];
    }

    public function __construct(private ModuleSettingsService $settings) {}

    /** @return array<string, mixed> */
    public function settingsFor(int $tenantId): array
    {
        return $this->settings->get($tenantId, 'settings', self::SETTINGS_KEY, self::defaults());
    }

    public function isEnabled(int $tenantId): bool
    {
        return (bool) ($this->settingsFor($tenantId)['enabled'] ?? true);
    }

    /** @return array<string, mixed>|null */
    public function plan(int $tenantId, string $planId): ?array
    {
        foreach ($this->settingsFor($tenantId)['plans'] ?? [] as $plan) {
            if (is_array($plan) && (string) ($plan['id'] ?? '') === $planId) {
                return $plan;
            }
        }

        return null;
    }

    public function isActive(?User $user): bool
    {
        if (! $user || ! $user->tenant_id) {
            return false;
        }
        if (! $this->isEnabled((int) $user->tenant_id)) {
            return false;
        }

        return MembershipEntitlement::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('user_id', $user->id)
            ->where('ends_at', '>', now())
            ->exists();
    }

    public function activeUntil(?User $user): ?Carbon
    {
        if (! $user || ! $user->tenant_id) {
            return null;
        }
        $row = MembershipEntitlement::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('user_id', $user->id)
            ->where('ends_at', '>', now())
            ->orderByDesc('ends_at')
            ->first();

        return $row?->ends_at;
    }

    public function productDiscountPercent(int $tenantId): int
    {
        return max(0, min(100, (int) ($this->settingsFor($tenantId)['product_discount_percent'] ?? 10)));
    }

    public function freeAudioDownloadLimit(int $tenantId): int
    {
        return max(0, (int) ($this->settingsFor($tenantId)['free_audio_downloads'] ?? 5));
    }

    public function audioDownloadsUsed(?User $user, ?int $tenantId = null, ?string $guestKey = null): int
    {
        $tenantId = $tenantId ?: (int) ($user?->tenant_id ?: 0);
        if ($tenantId < 1) {
            return 0;
        }
        $q = DB::table('poetry_download_logs')
            ->where('tenant_id', $tenantId)
            ->where('kind', 'audio')
            ->where('created_at', '>=', now()->subDays(30));
        if ($user) {
            $q->where('user_id', $user->id);
        } elseif ($guestKey) {
            $q->where('guest_key', $guestKey)->whereNull('user_id');
        } else {
            return 0;
        }

        return (int) $q->count();
    }

    public function audioDownloadsRemaining(?User $user, ?int $tenantId = null, ?string $guestKey = null): int
    {
        $tenantId = $tenantId ?: (int) ($user?->tenant_id ?: 0);
        if ($this->isActive($user)) {
            return PHP_INT_MAX;
        }

        return max(0, $this->freeAudioDownloadLimit($tenantId) - $this->audioDownloadsUsed($user, $tenantId, $guestKey));
    }

    public function canDownloadMedia(?User $user, int $tenantId, ?string $guestKey = null): bool
    {
        if ($this->isActive($user)) {
            return true;
        }

        return $this->audioDownloadsRemaining($user, $tenantId, $guestKey) > 0;
    }

    public function recordDownload(int $tenantId, ?int $userId, ?string $guestKey, ?int $mediaId, string $kind = 'audio'): void
    {
        DB::table('poetry_download_logs')->insert([
            'tenant_id' => $tenantId,
            'user_id' => $userId,
            'guest_key' => $userId ? null : $guestKey,
            'media_id' => $mediaId,
            'kind' => $kind === 'video' ? 'video' : 'audio',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * Hidden virtual product used as the order line for a membership plan.
     *
     * @param  array<string, mixed>  $plan
     */
    public function ensurePlanProduct(int $tenantId, array $plan): Product
    {
        $sku = 'membership-'.Str::slug((string) ($plan['id'] ?? 'plan'));
        $name = trim((string) (($plan['label'] ?? 'اشتراک ویژه').' — حساب کاربری ویژه'));
        $price = max(0, (int) ($plan['price_minor'] ?? 0));

        $product = Product::query()->firstOrNew([
            'tenant_id' => $tenantId,
            'sku' => $sku,
        ]);
        $product->fill([
            'name' => $name,
            'slug' => $product->slug ?: Str::slug($sku.'-'.$tenantId),
            'type' => 'virtual',
            'status' => 'private',
            'catalog_visibility' => 'hidden',
            'price_minor' => $price,
            'currency' => $product->currency ?: 'IRR',
            'manage_stock' => false,
            'stock_status' => 'instock',
            'is_available' => true,
            'is_hidden' => true,
            'meta' => array_merge(is_array($product->meta) ? $product->meta : [], [
                'membership_plan_id' => $plan['id'] ?? null,
                'membership_months' => (int) ($plan['months'] ?? 1),
                'kind' => 'membership',
            ]),
        ]);
        $product->save();

        return $product;
    }

    /**
     * Grant or extend membership by plan months.
     *
     * @param  array<string, mixed>  $meta
     */
    public function grant(User $user, string $planId, int $months, array $meta = []): MembershipEntitlement
    {
        $months = max(1, $months);
        $current = $this->activeUntil($user);
        $starts = $current && $current->isFuture() ? $current->copy() : now();
        $ends = $starts->copy()->addMonthsNoOverflow($months);

        return MembershipEntitlement::query()->create([
            'tenant_id' => (int) $user->tenant_id,
            'user_id' => $user->id,
            'plan_id' => $planId,
            'starts_at' => $current && $current->isFuture() ? now() : $starts,
            'ends_at' => $ends,
            'order_id' => $meta['order_id'] ?? null,
            'meta' => $meta,
        ]);
    }
}
