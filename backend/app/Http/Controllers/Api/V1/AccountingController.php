<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\TenantModule;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;

class AccountingController extends Controller
{
    public function status(Request $request): \Illuminate\Http\JsonResponse
    {
        $tenantId = $request->user()->tenant_id;
        $bundlePath = storage_path('app/bundles/accounting');

        $licensed = TenantModule::query()
            ->where('tenant_id', $tenantId)
            ->where('module_slug', 'accounting')
            ->where('licensed', true)
            ->exists();

        $bundlePresent = File::isDirectory($bundlePath);
        if ($bundlePresent) {
            $names = @scandir($bundlePath) ?: [];
            $bundlePresent = count(array_diff($names, ['.', '..'])) > 0;
        }

        $src = config('accounting.source_path');

        return response()->json([
            'data' => [
                'licensed' => $licensed,
                'bundle_present' => $bundlePresent,
                'bundle_path' => $bundlePath,
                'source_configured' => is_string($src) && $src !== '',
            ],
        ]);
    }
}
