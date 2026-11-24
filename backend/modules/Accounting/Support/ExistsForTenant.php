<?php

namespace Modules\Accounting\Support;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Support\Facades\DB;
use Modules\Accounting\Entities\Concerns\BelongsToTenant;

/**
 * `exists:` rule that respects tenancy.
 *
 * Laravel's built-in `exists:acc_persons,id` compiles to a query-builder lookup on the
 * table, which bypasses the model's global scope. In this module that is not a
 * cosmetic difference: a caller could pass another shop's `warehouse_id` and the rule
 * would say "valid", after which the write joins a foreign tenant's data.
 *
 * Usage: `'warehouse_id' => ['required', ExistsForTenant::in('acc_warehouses')]`.
 *
 * The column is almost always `id`; pass a second argument for foreign keys that point
 * at a non-key column, which no controller currently needs.
 */
final class ExistsForTenant implements ValidationRule
{
    private function __construct(
        private readonly string $table,
        private readonly string $column,
    ) {}

    public static function in(string $table, string $column = 'id'): self
    {
        return new self($table, $column);
    }

    public function validate(string $attribute, mixed $value, \Closure $fail): void
    {
        if ($value === null || $value === '') {
            return;
        }

        $query = DB::table($this->table)->where($this->column, $value);

        // Outside a tenant (console, seeder) nothing is scoped — matching the trait.
        $tenantId = BelongsToTenant::currentTenantId();

        if ($tenantId !== null) {
            $query->where('tenant_id', $tenantId);
        }

        if (! $query->exists()) {
            $fail(__('validation.exists', ['attribute' => $attribute]));
        }
    }
}
