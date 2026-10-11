<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\LinkHubFormSubmission;
use Illuminate\Http\Request;

class LinkHubInboxController extends Controller
{
    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $rows = LinkHubFormSubmission::query()
            ->where('tenant_id', $tid)
            ->with(['profile:id,title,slug,kind', 'block:id,type,payload'])
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 30));

        return response()->json(['data' => $rows]);
    }

    public function destroy(Request $request, LinkHubFormSubmission $submission): \Illuminate\Http\JsonResponse
    {
        abort_unless((int) $submission->tenant_id === (int) $request->user()->tenant_id, 404);
        $submission->delete();

        return response()->json(['data' => ['ok' => true]]);
    }
}
