<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Models\TeamMember;
use App\Models\Testimonial;
use Illuminate\Http\Request;

class PublicCorporateController extends Controller
{
    use ResolvesPublicTenant;

    public function announcements(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $rows = Announcement::query()->where('tenant_id', $tid)->active()
            ->orderByDesc('pinned')->orderByDesc('id')->paginate(20);

        return response()->json($rows);
    }

    public function testimonials(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $rows = Testimonial::query()->where('tenant_id', $tid)->published()->paginate(20);

        return response()->json($rows);
    }

    public function team(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $rows = TeamMember::query()->where('tenant_id', $tid)->published()->get();

        return response()->json(['data' => $rows]);
    }
}
