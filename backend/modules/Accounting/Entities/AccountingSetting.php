<?php

namespace Modules\Accounting\Entities;

use App\Models\Tenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Accounting\Entities\Concerns\BelongsToTenant;

/**
 * Key/value settings for the accounting module, per tenant.
 *
 * The ERP module reads its settings from `Modules\Core\Entities\SystemSetting`, a
 * single global `system_settings` table with no tenant column. That table does not
 * exist in this codebase, and copying its shape would mean every shop shares one
 * currency and one default fiscal year — the same leak as the ledger itself.
 *
 * This model keeps the ERP's exact static API (`get`, `set`, `forget`, `getByGroup`)
 * so the imported call sites are unchanged, while the underlying row is scoped to a
 * tenant. `tenant_id` is stamped by {@see BelongsToTenant}.
 *
 * Rows are read per request, so the values are memoised in a static map for the
 * lifetime of the process (Octane-safe: the map is flushed on write).
 */
class AccountingSetting extends Model
{
    use BelongsToTenant;

    protected $table = 'acc_settings';

    protected $fillable = [
        'tenant_id',
        'key',
        'value',
        'group',
    ];

    /**
     * Per-tenant memo of read values, keyed `<tenantId>:<key>`.
     *
     * The key includes the tenant on purpose. A plain `$memo[$key]` would serve shop A's
     * currency to shop B on the next request in the same worker — under Octane, where
     * the process outlives the request, that is a guaranteed cross-tenant leak rather
     * than a theoretical one.
     *
     * @var array<string, string>
     */
    private static array $memo = [];

    /**
     * Read one setting. Mirrors `SystemSetting::get()` so imported call sites do not change.
     *
     * Outside a tenant (console, seeder) the read spans all tenants and returns the
     * first match — that path is only used while seeding a chart of accounts, where
     * the value is written immediately afterwards by the same tenant-less context.
     */
    public static function get(string $key, mixed $default = null): mixed
    {
        $memoKey = self::memoKey($key);

        if (array_key_exists($memoKey, self::$memo)) {
            return self::$memo[$memoKey];
        }

        $value = static::query()->where('key', $key)->value('value');

        if ($value === null) {
            return $default;
        }

        // Stored as a string and returned as one, exactly like the ERP's SystemSetting.
        // Callers already cast: `(int) $fyId`, `(bool) $flag`.
        self::$memo[$memoKey] = (string) $value;

        return self::$memo[$memoKey];
    }

    /** Cache key that cannot collide across tenants, or across a tenant and console code. */
    private static function memoKey(string $key): string
    {
        $tenantId = static::currentTenantId();

        return ($tenantId === null ? 'none' : (string) $tenantId).':'.$key;
    }

    /** Write one setting. Mirrors `SystemSetting::set()`. */
    public static function set(string $key, mixed $value, string $group = 'general'): void
    {
        static::query()->updateOrCreate(
            ['key' => $key],
            ['value' => is_string($value) ? $value : json_encode($value), 'group' => $group],
        );

        unset(self::$memo[self::memoKey($key)]);
    }

    /** Drop a setting. Used when a value is cleared rather than set. */
    public static function forget(string $key): void
    {
        static::query()->where('key', $key)->delete();
        unset(self::$memo[self::memoKey($key)]);
    }

    /**
     * All settings in a group, keyed by setting key.
     *
     * @return array<string, string|null>
     */
    public static function getByGroup(string $group): array
    {
        return static::query()
            ->where('group', $group)
            ->pluck('value', 'key')
            ->toArray();
    }

    /** Clear the per-process memo. Called by tests and by long-running workers. */
    public static function flushMemo(): void
    {
        self::$memo = [];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class, 'tenant_id');
    }
}
