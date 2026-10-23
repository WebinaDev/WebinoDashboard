<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Tenant;
use App\Services\Site\SiteStatusService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SiteStatusController extends ProvisionController
{
    /** GET /api/v1/provision/site-status (platform, X-Provision-Token + X-Provision-Signature). */
    public function platformShow(Request $request, SiteStatusService $svc): JsonResponse
    {
        $this->assertProvisionAuth($request);
        $tenant = Tenant::query()->firstOrFail();

        return response()->json($svc->contract($svc->get((int) $tenant->id)));
    }

    /** PUT /api/v1/provision/site-status (platform). */
    public function platformUpdate(Request $request, SiteStatusService $svc): JsonResponse
    {
        $this->assertProvisionAuth($request);
        $data = $request->validate([
            'status' => ['required', 'in:active,coming_soon,suspended'],
            'reason' => ['nullable', 'string', 'max:500'],
            'expires_at' => ['nullable', 'date'],
            'launch_at' => ['nullable', 'date'],
            'renew_url' => ['nullable', 'url', 'max:500'],
            'support_url' => ['nullable', 'string', 'max:500'],
        ]);
        $tenant = Tenant::query()->firstOrFail();
        $changes = ['status' => $data['status'], 'reason' => $data['reason'] ?? null];
        foreach (['expires_at', 'launch_at', 'renew_url', 'support_url'] as $k) {
            if ($request->has($k)) {
                $changes[$k] = $data[$k] ?? null;
            }
        }

        return response()->json($svc->contract($svc->put((int) $tenant->id, $changes, 'platform')));
    }

    /** GET /api/v1/site-status (site admin). */
    public function adminShow(Request $request, SiteStatusService $svc): JsonResponse
    {
        return response()->json(['data' => $svc->get($this->adminTenantId($request))]);
    }

    /** PUT /api/v1/site-status (site admin): active <-> coming_soon only; cannot touch a platform suspension. */
    public function adminUpdate(Request $request, SiteStatusService $svc): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', 'in:active,coming_soon'],
            'launch_at' => ['nullable', 'date'],
        ]);
        $tid = $this->adminTenantId($request);
        if ($svc->get($tid)['status'] === 'suspended') {
            return response()->json(['message' => 'سایت توسط پلتفرم معلق شده و فقط با تمدید سرویس فعال می‌شود.'], 423);
        }

        return response()->json(['data' => $svc->put($tid, [
            'status' => $data['status'],
            'launch_at' => $data['launch_at'] ?? null,
            'reason' => null,
        ], 'admin')]);
    }

    private function adminTenantId(Request $request): int
    {
        return (int) ($request->user()?->tenant_id ?: Tenant::query()->value('id'));
    }
}
