<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Modules\ModuleGitInstaller;
use Illuminate\Http\Request;

class ModuleInstallController extends Controller
{
    public function install(Request $request, string $slug, ModuleGitInstaller $installer): \Illuminate\Http\JsonResponse
    {
        $tenantId = $request->user()->tenant_id;
        $row = $installer->install($tenantId, $slug);

        return response()->json(['data' => $row]);
    }
}
