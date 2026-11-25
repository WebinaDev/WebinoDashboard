<?php

namespace Modules\Cafe\Services;

use Illuminate\Support\Facades\DB;

/**
 * API keys for integrations, and the webhooks an event goes out to.
 *
 * Two rules this enforces so the rest of the codebase does not have to:
 *
 *  1. **A key is stored as a hash, shown once.** Losing the plaintext is the point: a leaked
 *     database backup must not contain working tokens. `prefix` exists so a person can still
 *     tell "the Zettle key" from "the accounting key" in a list.
 *
 *  2. **A key may only reach the scopes it holds.** A key made for reading orders cannot post a
 *     journal, even though the same endpoints accept a signed-in accountant. Scope checks go
 *     through `allows()`; no controller compares scope strings itself.
 */
final class IntegrationKeys
{
    /** The scopes a key can be granted. Anything not here is refused at creation. */
    public const SCOPES = [
        'orders.read',
        'orders.write',
        'menu.read',
        'menu.write',
        'stock.read',
        'stock.write',
        'reports.read',
        'accounting.read',
        'staff.read',
        'webhooks.read',
    ];

    /** Events the product emits. A hook with no event list gets all of them. */
    public const EVENTS = [
        'order.created',
        'order.settled',
        'order.cancelled',
        'order.amended',
        'shift.closed',
        'day.closed',
        'payroll.posted',
        'stock.low',
    ];

    /**
     * Create a key and return it. This is the only time the plaintext exists.
     *
     * @param  list<string>  $scopes
     * @return array{id: int, key: string, prefix: string, scopes: list<string>}
     */
    public function issue(int $tenantId, string $name, array $scopes, ?int $createdBy = null, ?string $expiresAt = null): array
    {
        $scopes = array_values(array_intersect($scopes, self::SCOPES));

        if ($scopes === []) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'scopes' => __('api.cafe_api_key_no_scopes'),
            ]);
        }

        $plain = 'wbn_'.bin2hex(random_bytes(24));
        $prefix = substr($plain, 0, 12);

        $id = (int) DB::table('cafe_api_keys')->insertGetId([
            'tenant_id' => $tenantId,
            'name' => $name,
            'prefix' => $prefix,
            'key_hash' => hash('sha256', $plain),
            'scopes' => json_encode($scopes, JSON_UNESCAPED_UNICODE),
            'expires_at' => $expiresAt,
            'created_by' => $createdBy,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return ['id' => $id, 'key' => $plain, 'prefix' => $prefix, 'scopes' => $scopes];
    }

    /**
     * Resolve a presented key to its tenant and scopes, or null.
     *
     * A revoked or expired key resolves to null rather than a distinguishable error: telling a
     * caller *why* their key failed hands them a probe.
     *
     * @return array{tenant_id: int, id: int, scopes: list<string>}|null
     */
    public function resolve(string $plain): ?array
    {
        $row = DB::table('cafe_api_keys')
            ->where('key_hash', hash('sha256', $plain))
            ->whereNull('revoked_at')
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->first();

        if ($row === null) {
            return null;
        }

        DB::table('cafe_api_keys')->where('id', $row->id)->update(['last_used_at' => now()]);

        return [
            'tenant_id' => (int) $row->tenant_id,
            'id' => (int) $row->id,
            'scopes' => json_decode((string) ($row->scopes ?? '[]'), true) ?: [],
        ];
    }

    /** @param  list<string>  $scopes */
    public function allows(array $scopes, string $required): bool
    {
        if (in_array($required, $scopes, true)) {
            return true;
        }

        // `orders.*` covers every `orders.x`; a wildcard grant is deliberate, not a typo.
        $family = explode('.', $required)[0].'.*';

        return in_array($family, $scopes, true);
    }

    /**
     * Queue an event for every hook in the tenant that wants it.
     *
     * Delivery is recorded first and sent later, so a webhook endpoint that is down loses no
     * events and a person can see, per delivery, what failed and when it last worked.
     *
     * @param  array<string, mixed>  $payload
     */
    public function dispatch(int $tenantId, string $event, array $payload): int
    {
        $hooks = DB::table('cafe_webhooks')
            ->where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->get();

        $queued = 0;

        foreach ($hooks as $hook) {
            $events = json_decode((string) ($hook->events ?? 'null'), true);
            if (is_array($events) && $events !== [] && ! in_array($event, $events, true)) {
                continue;
            }

            DB::table('cafe_webhook_deliveries')->insert([
                'tenant_id' => $tenantId,
                'webhook_id' => $hook->id,
                'event' => $event,
                'status' => 'queued',
                'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $queued++;
        }

        return $queued;
    }

    /** The signature an endpoint verifies: HMAC of the raw body with the hook's secret. */
    public function signature(string $secret, string $body): string
    {
        return hash_hmac('sha256', $body, $secret);
    }
}
