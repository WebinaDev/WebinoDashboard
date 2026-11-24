<?php

namespace Modules\Accounting\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Accounting\Entities\AccCheck;

class CheckController extends Controller
{
    public function checks(Request $request): JsonResponse
    {
        $q = AccCheck::query()->with(['cashAccount', 'person'])->orderByDesc('id');
        if ($request->filled('status')) {
            $q->where('status', $request->input('status'));
        }

        return response()->json(['data' => $q->paginate(min((int) $request->input('per_page', 25), 100))]);
    }

    public function setCheckStatus(Request $request, int $id): JsonResponse
    {
        $c = AccCheck::query()->findOrFail($id);
        $data = $request->validate([
            'status' => 'required|string|in:issued,deposited,cleared,bounced,returned',
        ]);
        $c->update(['status' => $data['status']]);

        return response()->json(['data' => $c->fresh()]);
    }
}
