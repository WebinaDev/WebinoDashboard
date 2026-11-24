<?php

namespace App\Services\Accounting;

use App\Models\AccAccount;
use App\Models\AccAccountCoding;
use App\Services\Modules\ModuleSettingsService;

/**
 * Resolves ledger roles ("sales", "vat", "cash") to chart-of-accounts codes.
 *
 * Requirement: the coding must be editable in settings. Everything downstream — the sales
 * journal, the tender split, COGS — asks this class for a code instead of naming one, so an
 * accountant changing the chart never touches code.
 *
 * Two layers:
 *  1. Per-tenant overrides in `accounting_account_coding`.
 *  2. The default chart, applied when a role was never customised.
 *
 * A role with no mapping and no default is reported, never invented. `validate()` is what
 * the settings screen calls before it saves.
 */
final class AccountCoding
{
    public const MODULE = 'accounting';

    public const SUBMODULE = 'coding';

    /** Tenders a counter sale can settle with, matching OrderPayments::TENDERS. */
    public const TENDERS = [
        'cash',
        'card_to_card',
        'pos_terminal',
        'online',
        'wallet',
        'other',
    ];

    /**
     * The chart this product ships with.
     *
     * Codes follow the Iranian standard chart-of-accounts grouping (1 = assets,
     * 2 = liabilities, 3 = equity, 4 = revenue, 5 = expenses) so an accountant can map their
     * own numbering onto it without translating our role names.
     *
     * @return array<string, array{code: string, name: string, type: string}>
     */
    public static function defaults(): array
    {
        return [
            AccAccountCoding::ROLE_AR => ['code' => '1101', 'name' => 'حساب‌های دریافتنی', 'type' => 'asset'],
            AccAccountCoding::ROLE_CASH => ['code' => '1102', 'name' => 'موجودی نقد و صندوق', 'type' => 'asset'],
            AccAccountCoding::ROLE_BANK => ['code' => '1103', 'name' => 'موجودی بانک', 'type' => 'asset'],
            AccAccountCoding::ROLE_AP => ['code' => '2102', 'name' => 'حساب‌های پرداختنی', 'type' => 'liability'],
            AccAccountCoding::ROLE_VAT => ['code' => '2101', 'name' => 'مالیات بر ارزش افزوده پرداختنی', 'type' => 'liability'],
            AccAccountCoding::ROLE_INVENTORY => ['code' => '1301', 'name' => 'موجودی کالا', 'type' => 'asset'],
            AccAccountCoding::ROLE_SALES => ['code' => '4101', 'name' => 'درآمد فروش', 'type' => 'revenue'],
            AccAccountCoding::ROLE_SALES_RETURNS => ['code' => '4102', 'name' => 'برگشت از فروش', 'type' => 'revenue'],
            AccAccountCoding::ROLE_DISCOUNT => ['code' => '4103', 'name' => 'تخفیفات فروش', 'type' => 'revenue'],
            AccAccountCoding::ROLE_SHIPPING => ['code' => '4104', 'name' => 'درآمد ارسال', 'type' => 'revenue'],
            AccAccountCoding::ROLE_COGS => ['code' => '5101', 'name' => 'بهای تمام‌شده کالای فروش‌رفته', 'type' => 'expense'],
        ];
    }

    /**
     * Which default account a tender settles into when the tenant has not mapped it.
     *
     * This is the fix for "every tender debits receivables": cash must land in the drawer,
     * a card/terminal/online payment in the bank. A tender we cannot classify goes to AR,
     * which is the honest answer — it means "owed, not yet received".
     */
    public function defaultRoleForTender(string $tender): string
    {
        return match ($tender) {
            'cash' => AccAccountCoding::ROLE_CASH,
            'card_to_card', 'pos_terminal', 'online', 'wallet' => AccAccountCoding::ROLE_BANK,
            default => AccAccountCoding::ROLE_AR,
        };
    }

    /**
     * Effective coding for a tenant: defaults, overridden by whatever was saved.
     *
     * Shape returned to the settings screen:
     *   roles:   { sales: "4101", vat: "2101", … }
     *   tenders: { cash: "1102", card_to_card: "1103", … }
     *
     * @return array{roles: array<string, string>, tenders: array<string, string>}
     */
    public function get(int $tenantId): array
    {
        $roles = [];
        foreach (self::defaults() as $role => $def) {
            $roles[$role] = $def['code'];
        }

        $tenders = [];
        foreach (self::TENDERS as $tender) {
            $tenders[$tender] = $this->defaultCodeForTender($tender);
        }

        $rows = AccAccountCoding::query()
            ->where('tenant_id', $tenantId)
            ->get();

        foreach ($rows as $row) {
            if ($row->role === AccAccountCoding::ROLE_TENDER) {
                if ($row->match_value !== null && $row->match_value !== '') {
                    $tenders[$row->match_value] = (string) $row->code;
                }

                continue;
            }

            if (array_key_exists($row->role, $roles) || isset(self::defaults()[$row->role])) {
                $roles[$row->role] = (string) $row->code;
            }
        }

        return ['roles' => $roles, 'tenders' => $tenders];
    }

    /** The code a tender settles into. */
    public function tenderCode(int $tenantId, string $tender): string
    {
        $coding = $this->get($tenantId);

        return $coding['tenders'][$tender] ?? $this->defaultCodeForTender($tender);
    }

    /** A role's code, or a hard failure — never a guess. */
    public function code(int $tenantId, string $role): string
    {
        $coding = $this->get($tenantId);
        $code = $coding['roles'][$role] ?? null;

        if (! is_string($code) || $code === '') {
            throw new \RuntimeException(
                "No account code is mapped for role [{$role}]. Set it in accounting settings before posting."
            );
        }

        return $code;
    }

    /** Whether a role is mapped, for a caller that can degrade instead of failing. */
    public function has(int $tenantId, string $role): bool
    {
        $code = $this->get($tenantId)['roles'][$role] ?? null;

        return is_string($code) && $code !== '';
    }

    /**
     * Save mappings. An empty string clears the override and restores the default.
     *
     * @param  array{roles?: array<string, mixed>, tenders?: array<string, mixed>}  $payload
     * @return array{roles: array<string, string>, tenders: array<string, string>}
     */
    public function put(int $tenantId, array $payload): array
    {
        $roles = is_array($payload['roles'] ?? null) ? $payload['roles'] : [];
        $tenders = is_array($payload['tenders'] ?? null) ? $payload['tenders'] : [];

        foreach ($roles as $role => $code) {
            $this->store($tenantId, (string) $role, null, (string) $code);
        }

        foreach ($tenders as $tender => $code) {
            $this->store($tenantId, AccAccountCoding::ROLE_TENDER, (string) $tender, (string) $code);
        }

        return $this->get($tenantId);
    }

    /**
     * Problems the settings screen should refuse to save with.
     *
     * Checked here rather than in the controller so the same rules apply to the seed command
     * and to any future importer.
     *
     * @param  array{roles?: array<string, mixed>, tenders?: array<string, mixed>}  $payload
     * @return list<string>
     */
    public function validate(int $tenantId, array $payload): array
    {
        $errors = [];
        $merged = $this->mergeForValidation($tenantId, $payload);

        $codes = [];
        foreach ($merged['roles'] as $role => $code) {
            if ($code === '') {
                $errors[] = "role:{$role}:empty";

                continue;
            }
            $codes[$role] = $code;
        }
        foreach ($merged['tenders'] as $tender => $code) {
            if ($code === '') {
                $errors[] = "tender:{$tender}:empty";

                continue;
            }
            $codes['tender:'.$tender] = $code;
        }

        // Two roles on one code is legal (a shop may fold sales returns into sales), but a
        // role pointing at an account that does not exist in the chart is not: the journal
        // would reference a code the ledger cannot name.
        //
        // A shipped default code always passes even when the tenant has not added it to their
        // chart yet — posting creates those accounts on demand, and refusing them here would
        // make the first save on a fresh tenant impossible.
        $known = $this->knownCodes($tenantId);
        $defaultCodes = array_column(self::defaults(), 'code');
        foreach ($codes as $key => $code) {
            if (in_array($code, $known, true) || in_array($code, $defaultCodes, true)) {
                continue;
            }
            $errors[] = "{$key}:unknown_code:{$code}";
        }

        return $errors;
    }

    /**
     * Make sure every mapped code exists as an account, creating the ones that do not.
     *
     * Called by the sales journal so a tenant that saved a code without first adding it to
     * the chart still posts — with an account row that carries the right name and type.
     *
     * @return array<string, AccAccount>
     */
    public function ensureAccounts(int $tenantId): array
    {
        $coding = $this->get($tenantId);
        $defaults = self::defaults();
        $out = [];

        foreach ($coding['roles'] as $role => $code) {
            $meta = $defaults[$role] ?? ['name' => $code, 'type' => 'asset'];
            $out[$role] = AccAccount::query()->firstOrCreate(
                ['tenant_id' => $tenantId, 'code' => $code],
                ['name' => $meta['name'], 'type' => $meta['type']],
            );
        }

        foreach ($coding['tenders'] as $tender => $code) {
            $role = $this->defaultRoleForTender($tender);
            $meta = $defaults[$role] ?? ['name' => $code, 'type' => 'asset'];
            $out['tender:'.$tender] = AccAccount::query()->firstOrCreate(
                ['tenant_id' => $tenantId, 'code' => $code],
                ['name' => $meta['name'], 'type' => $meta['type']],
            );
        }

        return $out;
    }

    /** Codes present in the tenant's chart of accounts. */
    private function knownCodes(int $tenantId): array
    {
        return AccAccount::query()
            ->where('tenant_id', $tenantId)
            ->pluck('code')
            ->map(fn ($c): string => (string) $c)
            ->all();
    }

    /**
     * Fold the payload over the saved coding without persisting, so validation sees exactly
     * what the save would produce.
     *
     * @param  array{roles?: array<string, mixed>, tenders?: array<string, mixed>}  $payload
     * @return array{roles: array<string, string>, tenders: array<string, string>}
     */
    private function mergeForValidation(int $tenantId, array $payload): array
    {
        $current = $this->get($tenantId);

        foreach ((array) ($payload['roles'] ?? []) as $role => $code) {
            $current['roles'][(string) $role] = (string) $code;
        }
        foreach ((array) ($payload['tenders'] ?? []) as $tender => $code) {
            $current['tenders'][(string) $tender] = (string) $code;
        }

        return $current;
    }

    private function store(int $tenantId, string $role, ?string $match, string $code): void
    {
        if ($code === '') {
            $q = AccAccountCoding::query()
                ->where('tenant_id', $tenantId)
                ->where('role', $role);
            $match === null ? $q->whereNull('match_value') : $q->where('match_value', $match);
            $q->delete();

            return;
        }

        AccAccountCoding::query()->updateOrCreate(
            ['tenant_id' => $tenantId, 'role' => $role, 'match_value' => $match],
            ['code' => $code],
        );
    }

    private function defaultCodeForTender(string $tender): string
    {
        $role = $this->defaultRoleForTender($tender);

        return self::defaults()[$role]['code'] ?? self::defaults()[AccAccountCoding::ROLE_AR]['code'];
    }
}
