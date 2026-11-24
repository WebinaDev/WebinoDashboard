<?php

namespace Modules\Cafe\Services;

use Illuminate\Validation\ValidationException;

/**
 * How this shop hands food to a guest: at a table, by pager, or not at all.
 *
 * The distinction is not cosmetic. A dine-in order without a table is unservable, and a
 * takeaway order that demands one is a queue at the counter. Before this, "dine-in" always
 * demanded a table code, which made a pager-only bakery unable to take a dine-in sale at all.
 *
 * Three modes, and what each means for order intake:
 *
 *   table  — a dine-in order must name a table.
 *   pager  — a dine-in order must name a pager; the guest waits for it to buzz.
 *   none   — there is no seat service: dine-in behaves like takeaway and needs neither.
 *
 * Stored with the other operational settings so it is one screen, not a config file.
 */
final class ServiceMode
{
    public const MODE_TABLE = 'table';

    public const MODE_PAGER = 'pager';

    public const MODE_NONE = 'none';

    public const MODES = [self::MODE_TABLE, self::MODE_PAGER, self::MODE_NONE];

    public function __construct(private readonly OperationsSettings $settings) {}

    public function of(int $tenantId): string
    {
        $mode = (string) ($this->settings->get($tenantId)['service_mode'] ?? self::MODE_TABLE);

        return in_array($mode, self::MODES, true) ? $mode : self::MODE_TABLE;
    }

    /** Whether a dine-in order needs a table code under this mode. */
    public function requiresTable(int $tenantId): bool
    {
        return $this->of($tenantId) === self::MODE_TABLE;
    }

    /** Whether a dine-in order needs a pager number under this mode. */
    public function requiresPager(int $tenantId): bool
    {
        return $this->of($tenantId) === self::MODE_PAGER;
    }

    /**
     * Refuse an order that cannot be served under the configured mode.
     *
     * Called from order intake rather than from each controller: a rule about service belongs
     * with the order, and every entry point (till, storefront, QR) goes through intake.
     *
     * @param  array<string, mixed>  $payload
     */
    public function assertServable(int $tenantId, string $fulfillment, array $payload): void
    {
        if ($fulfillment !== 'dine_in') {
            return;
        }

        $mode = $this->of($tenantId);

        if ($mode === self::MODE_TABLE) {
            // The table is resolved (and refused) by intake itself, which also checks the
            // branch and the active flag; only "there is a table at all" is decided here.
            return;
        }

        if ($mode === self::MODE_PAGER) {
            $pager = trim((string) ($payload['pager_number'] ?? ''));
            if ($pager === '') {
                throw ValidationException::withMessages([
                    'pager_number' => __('api.cafe_service_mode_needs_pager'),
                ]);
            }
        }
    }

    /** What the till should show for dine-in chips: which field to ask for, if any. */
    public function requirements(int $tenantId): array
    {
        $mode = $this->of($tenantId);

        return [
            'mode' => $mode,
            'needs_table' => $mode === self::MODE_TABLE,
            'needs_pager' => $mode === self::MODE_PAGER,
        ];
    }
}
