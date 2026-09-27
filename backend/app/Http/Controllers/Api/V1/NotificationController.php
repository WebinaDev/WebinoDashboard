<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\UserNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $page = max(1, (int) $request->query('page', 1));
        $perPage = min(50, max(1, (int) $request->query('per_page', 15)));
        $base = UserNotification::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('user_id', $user->id);
        $total = (clone $base)->count();
        $unread = (clone $base)->whereNull('read_at')->count();
        $items = (clone $base)->orderByDesc('id')->forPage($page, $perPage)->get()
            ->map(fn (UserNotification $n) => [
                'id' => $n->id,
                'type' => $n->type,
                'title' => $n->title,
                'body' => $n->body ?? '',
                'link' => $n->link ?? '',
                'read' => $n->read_at !== null,
                'read_at' => optional($n->read_at)?->toIso8601String(),
                'created_at' => optional($n->created_at)?->toIso8601String(),
            ])->all();

        return response()->json([
            'data' => [
                'items' => $items,
                'total' => $total,
                'unread' => $unread,
                'page' => $page,
                'per_page' => $perPage,
            ],
        ]);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $user = $request->user();
        UserNotification::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('user_id', $user->id)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return response()->json(['data' => ['ok' => true]]);
    }

    public function markRead(Request $request, int $notification): JsonResponse
    {
        $user = $request->user();
        $row = UserNotification::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('user_id', $user->id)
            ->where('id', $notification)
            ->firstOrFail();
        if ($row->read_at === null) {
            $row->update(['read_at' => now()]);
        }

        return response()->json(['data' => ['ok' => true]]);
    }
}
