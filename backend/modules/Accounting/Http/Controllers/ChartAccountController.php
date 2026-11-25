<?php

namespace Modules\Accounting\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Modules\Accounting\Database\Seeders\AccChartIranSeeder;
use Modules\Accounting\Entities\AccChartAccount;
use Modules\Accounting\Support\ExistsForTenant;

class ChartAccountController extends Controller
{
    public function chartOfAccounts(Request $request): JsonResponse
    {
        $fyId = $request->input('fiscal_year_id');
        $q = AccChartAccount::query()->orderBy('code');
        $rows = $q->get()->map(function (AccChartAccount $a) {
            $depth = 0;
            $p = $a->parent_id;
            $guard = 0;
            while ($p && $guard++ < 20) {
                $depth++;
                $parent = AccChartAccount::query()->find($p);
                $p = $parent?->parent_id;
            }

            return [
                'id' => $a->id,
                'code' => $a->code,
                'name' => $a->name,
                'parent_id' => $a->parent_id,
                'type' => $a->type,
                'is_postable' => $a->is_postable,
                'depth' => $depth,
            ];
        });

        return response()->json([
            'data' => $rows,
            'meta' => ['fiscal_year_id' => $fyId],
        ]);
    }

    public function seedChartIran(Request $request): JsonResponse
    {
        // Tenant-scoped by the model's trait, so this is safe in production: it
        // only ever fills the signed-in tenant's own chart. The old production
        // block made first-run setup impossible on live shops.
        $request->validate(['truncate' => 'prohibited']);
        $result = AccChartIranSeeder::run();

        return response()->json(['data' => $result]);
    }

    public function storeChartAccount(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        $data = $request->validate([
            'code' => ['required', 'string', 'max:32', Rule::unique('acc_chart_accounts', 'code')->where('tenant_id', $tenantId)],
            'name' => 'required|string|max:191',
            'parent_id' => ['nullable', ExistsForTenant::in('acc_chart_accounts')],
            'type' => 'required|string|max:50',
            'is_postable' => 'boolean',
        ]);
        $row = AccChartAccount::query()->create($data + ['is_postable' => $data['is_postable'] ?? false]);

        return response()->json(['data' => $row], 201);
    }

    public function updateChartAccount(Request $request, int $id): JsonResponse
    {
        $row = AccChartAccount::query()->findOrFail($id);
        $tenantId = (int) $request->user()->tenant_id;

        $data = $request->validate([
            'code' => ['sometimes', 'string', 'max:32', Rule::unique('acc_chart_accounts', 'code')->where('tenant_id', $tenantId)->ignore($row->id)],
            'name' => 'sometimes|string|max:191',
            'parent_id' => ['nullable', ExistsForTenant::in('acc_chart_accounts')],
            'type' => 'sometimes|string|max:50',
            'is_postable' => 'boolean',
        ]);
        $row->update($data);

        return response()->json(['data' => $row->fresh()]);
    }

    public function destroyChartAccount(int $id): JsonResponse
    {
        AccChartAccount::query()->whereKey($id)->delete();

        return response()->json([], 204);
    }
}
