<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\SiteConsultation;
use Illuminate\Http\Request;

class SiteConsultationController extends Controller
{
    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $rows = SiteConsultation::query()->where('tenant_id', $tid)->orderByDesc('id')->paginate(20);

        return response()->json($rows);
    }

    public function show(Request $request, int $consultation): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = SiteConsultation::query()->where('tenant_id', $tid)->findOrFail($consultation);

        return response()->json(['data' => $row]);
    }

    public function update(Request $request, int $consultation): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = SiteConsultation::query()->where('tenant_id', $tid)->findOrFail($consultation);
        $data = $request->validate([
            'status' => 'sometimes|string|max:32',
        ]);
        $row->update($data);

        return response()->json(['data' => $row]);
    }
}
