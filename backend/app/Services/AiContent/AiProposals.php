<?php

namespace App\Services\AiContent;

use App\Models\Product;
use Illuminate\Support\Facades\DB;

final class AiProposals
{
    /**
     * @return array{items: list<array<string, mixed>>, total: int}
     */
    public function list(int $tenantId, ?string $kind = null, ?string $status = 'pending'): array
    {
        $q = DB::table('ai_proposals')->where('tenant_id', $tenantId);
        if ($kind) {
            $q->where('kind', $kind);
        }
        if ($status) {
            $q->where('status', $status);
        }
        $total = (clone $q)->count();
        $items = $q->orderByDesc('id')->limit(100)->get()->map(function ($r) {
            $a = (array) $r;
            foreach (['current_json', 'proposed_json'] as $k) {
                if (is_string($a[$k] ?? null)) {
                    $a[$k] = json_decode($a[$k], true) ?: [];
                }
            }

            return $a;
        })->all();

        return ['items' => $items, 'total' => $total];
    }

    public function apply(int $tenantId, int $id): bool
    {
        $row = DB::table('ai_proposals')->where('tenant_id', $tenantId)->where('id', $id)->first();
        if (! $row || $row->status !== 'pending') {
            return false;
        }
        $proposed = is_string($row->proposed_json) ? json_decode($row->proposed_json, true) : $row->proposed_json;
        if (! is_array($proposed)) {
            return false;
        }
        $p = Product::query()->where('tenant_id', $tenantId)->find($row->product_id);
        if (! $p) {
            return false;
        }
        if ($row->kind === 'title' && ! empty($proposed['title'])) {
            $p->name = (string) $proposed['title'];
            $p->save();
        }
        if ($row->kind === 'category' && ! empty($proposed['category_id'])) {
            $p->category_id = (int) $proposed['category_id'];
            $p->save();
        }
        if ($row->kind === 'related' && isset($proposed['related_ids']) && is_array($proposed['related_ids'])) {
            $p->related_ids = array_map('intval', $proposed['related_ids']);
            $p->save();
        }
        DB::table('ai_proposals')->where('id', $id)->update(['status' => 'applied', 'updated_at' => now()]);

        return true;
    }

    public function skip(int $tenantId, int $id): bool
    {
        return DB::table('ai_proposals')
            ->where('tenant_id', $tenantId)
            ->where('id', $id)
            ->where('status', 'pending')
            ->update(['status' => 'skipped', 'updated_at' => now()]) > 0;
    }
}
