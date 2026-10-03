<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ErpAnnouncement;
use App\Models\ErpAnnouncementRead;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Receiver for ERP → tenant announcements.
 * CMS site announcements stay on /announcements. This inbox is /account/announcements.
 */
class ErpAnnouncementController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $rows = $this->visible($user)->orderByDesc('created_at')->orderByDesc('id')->limit(50)->get();
        $reads = $this->readMap($user, $rows->pluck('id')->all());
        $items = $rows->map(fn (ErpAnnouncement $row) => $this->payload($row, isset($reads[$row->id])))->all();
        $unread = collect($items)->where('read', false)->count();

        return response()->json([
            'data' => [
                'items' => $items,
                'total' => count($items),
                'unread' => $unread,
            ],
        ]);
    }

    public function markRead(Request $request, string $announcement): JsonResponse
    {
        $user = $request->user();
        $row = $this->findVisible($user, $announcement);
        ErpAnnouncementRead::query()->updateOrCreate(
            ['announcement_id' => $row->id, 'user_id' => $user->id],
            ['read_at' => now()],
        );

        return response()->json(['data' => ['ok' => true]]);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $user = $request->user();
        $ids = $this->visible($user)->pluck('id');
        foreach ($ids as $id) {
            ErpAnnouncementRead::query()->updateOrCreate(
                ['announcement_id' => $id, 'user_id' => $user->id],
                ['read_at' => now()],
            );
        }

        return response()->json(['data' => ['ok' => true]]);
    }

    public function ingest(Request $request): JsonResponse
    {
        if (! $this->ingestAuthorized($request)) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $data = $request->validate([
            'id' => ['required'],
            'title' => ['required', 'string', 'max:255'],
            'body' => ['nullable', 'string'],
            'created_at' => ['required', 'date'],
            'audience' => ['required', 'string', 'in:all,staff,admins'],
            'tenant_id' => ['nullable', 'integer'],
            'tenant_domain' => ['nullable', 'string', 'max:255'],
        ]);

        $tenantId = $this->resolveTenantId($request, $data);
        $sourceId = trim((string) $data['id']);
        $row = ErpAnnouncement::query()->updateOrCreate(
            ['source_id' => $sourceId],
            [
                'tenant_id' => $tenantId,
                'title' => $data['title'],
                'body' => $data['body'] ?? '',
                'audience' => $data['audience'],
                'created_at' => Carbon::parse($data['created_at']),
            ],
        );

        return response()->json(['data' => $this->payload($row, false)], 201);
    }

    /** @param  array<string, mixed>  $data */
    private function resolveTenantId(Request $request, array $data): ?int
    {
        if (! empty($data['tenant_id'])) {
            return (int) $data['tenant_id'];
        }
        if (! empty($data['tenant_domain'])) {
            $tenant = Tenant::query()->where('domain', $data['tenant_domain'])->first();
            abort_if($tenant === null, 422, 'Unknown tenant');

            return (int) $tenant->id;
        }
        $user = $this->actor($request);
        if (! $this->tokenMatches($request) && $user) {
            return (int) $user->tenant_id;
        }

        return null;
    }

    private function ingestAuthorized(Request $request): bool
    {
        if ($this->tokenMatches($request)) {
            return true;
        }
        $user = $this->actor($request);

        return $user !== null && ! in_array((string) $user->role, ['customer', 'subscriber'], true);
    }

    private function actor(Request $request): ?User
    {
        $user = $request->user() ?? auth('sanctum')->user();

        return $user instanceof User ? $user : null;
    }

    private function tokenMatches(Request $request): bool
    {
        $expected = (string) config('services.webino.erp_api_token', '');
        $given = (string) $request->bearerToken();

        return $expected !== '' && $given !== '' && hash_equals($expected, $given);
    }

    private function visible(User $user): Builder
    {
        $role = (string) $user->role;

        return ErpAnnouncement::query()
            ->where(function (Builder $query) use ($user) {
                $query->whereNull('tenant_id')->orWhere('tenant_id', $user->tenant_id);
            })
            ->where(function (Builder $query) use ($role) {
                $query->where('audience', 'all');
                if ($role !== 'customer') {
                    $query->orWhere('audience', 'staff');
                }
                if ($role === 'admin') {
                    $query->orWhere('audience', 'admins');
                }
            });
    }

    private function findVisible(User $user, string $id): ErpAnnouncement
    {
        $query = $this->visible($user);
        $row = (clone $query)->where('source_id', $id)->first();
        if ($row === null && ctype_digit($id)) {
            $row = (clone $query)->whereKey((int) $id)->first();
        }
        abort_if($row === null, 404);

        return $row;
    }

    /** @param  list<int>  $ids
     * @return array<int, true>
     */
    private function readMap(User $user, array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        return ErpAnnouncementRead::query()
            ->where('user_id', $user->id)
            ->whereIn('announcement_id', $ids)
            ->pluck('announcement_id')
            ->mapWithKeys(fn ($id) => [(int) $id => true])
            ->all();
    }

    /** @return array{id: int|string, title: string, body: string, created_at: string|null, audience: string, read: bool} */
    private function payload(ErpAnnouncement $row, bool $read): array
    {
        $source = (string) ($row->source_id ?? '');
        $id = $source === ''
            ? $row->id
            : (ctype_digit($source) ? (int) $source : $source);

        return [
            'id' => $id,
            'title' => $row->title,
            'body' => (string) ($row->body ?? ''),
            'created_at' => optional($row->created_at)?->toIso8601String(),
            'audience' => $row->audience,
            'read' => $read,
        ];
    }
}
