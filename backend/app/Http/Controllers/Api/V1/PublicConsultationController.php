<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Jobs\SyncConsultationToErmJob;
use App\Models\SiteConsultation;
use Illuminate\Http\Request;

class PublicConsultationController extends Controller
{
    use ResolvesPublicTenant;

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:120',
            'email' => 'required|email|max:255',
            'phone' => 'nullable|string|max:32',
            'subject' => 'nullable|string|max:255',
            'message' => 'nullable|string|max:5000',
        ]);

        $tid = $this->publicTenantId($request);
        $row = SiteConsultation::query()->create([
            'tenant_id' => $tid,
            'name' => $data['name'],
            'email' => $data['email'],
            'phone' => $data['phone'] ?? null,
            'subject' => $data['subject'] ?? null,
            'message' => $data['message'] ?? null,
            'status' => 'new',
        ]);

        SyncConsultationToErmJob::dispatch($row->id);

        return response()->json(['data' => ['id' => $row->id]], 201);
    }
}
