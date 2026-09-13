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
        try {
            $row = $installer->install($tenantId, $slug);
        } catch (\Illuminate\Http\Exceptions\HttpResponseException $e) {
            throw $e;
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            return response()->json(['message' => $e->getMessage()], $e->getStatusCode());
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $row]);
    }

    public function status(Request $request, string $slug, ModuleGitInstaller $installer): \Illuminate\Http\JsonResponse
    {
        $tenantId = $request->user()->tenant_id;

        return response()->json(['data' => $installer->status($tenantId, $slug)]);
    }
}
