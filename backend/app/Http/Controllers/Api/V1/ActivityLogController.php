<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Read-only access to the activity trail.
 *
 * There is no write or delete endpoint on purpose: a trail that the application can edit
 * proves nothing. Rows are removed only by the database retention policy.
 */
class ActivityLogController extends Controller
{
    private const PER_PAGE = 50;

    public function index(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        $query = ActivityLog::query()->forTenant($tenantId)->latest('id');

        $this->applyFilters($query, $request);

        $page = $query->paginate(self::PER_PAGE);

        return response()->json([
            'data' => collect($page->items())->map(fn (ActivityLog $row): array => $this->present($row))->all(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'total' => $page->total(),
                'per_page' => $page->perPage(),
                'filters' => $this->filters($request),
            ],
        ]);
    }

    /** One record's history, newest first — the "what happened to this order" view. */
    public function forSubject(Request $request): JsonResponse
    {
        $data = $request->validate([
            'subject_type' => ['required', 'string', 'max:96'],
            'subject_id' => ['required', 'integer'],
        ]);

        $rows = ActivityLog::query()
            ->forTenant((int) $request->user()->tenant_id)
            ->forSubject($data['subject_type'], $data['subject_id'])
            ->latest('id')
            ->limit(200)
            ->get();

        return response()->json([
            'data' => $rows->map(fn (ActivityLog $row): array => $this->present($row))->all(),
        ]);
    }

    /** Distinct event names, so the UI filter is data-driven rather than hardcoded. */
    public function events(Request $request): JsonResponse
    {
        $events = ActivityLog::query()
            ->forTenant((int) $request->user()->tenant_id)
            ->distinct()
            ->orderBy('event')
            ->pluck('event')
            ->all();

        return response()->json(['data' => $events]);
    }

    private function applyFilters(Builder $query, Request $request): void
    {
        $filters = $this->filters($request);

        if ($filters['event'] !== null) {
            $query->event($filters['event']);
        }

        if ($filters['actor_id'] !== null) {
            $query->where('actor_id', $filters['actor_id']);
        }

        if ($filters['branch_id'] !== null) {
            $query->where('branch_id', $filters['branch_id']);
        }

        if ($filters['subject_type'] !== null) {
            // A type without an id means "everything of this kind"; passing null through
            // to the id constraint would match nothing at all.
            $filters['subject_id'] === null
                ? $query->whereIn('subject_type', array_unique([
                    $filters['subject_type'],
                    class_basename($filters['subject_type']),
                ]))
                : $query->forSubject($filters['subject_type'], $filters['subject_id']);
        }

        if ($filters['from'] !== null) {
            $query->where('created_at', '>=', $filters['from'].' 00:00:00');
        }

        if ($filters['to'] !== null) {
            $query->where('created_at', '<=', $filters['to'].' 23:59:59');
        }

        if ($filters['q'] !== null) {
            $needle = '%'.$filters['q'].'%';
            $query->where(function (Builder $inner) use ($needle): void {
                $inner->where('subject_label', 'like', $needle)
                    ->orWhere('actor_name', 'like', $needle)
                    ->orWhere('description', 'like', $needle);
            });
        }
    }

    /** @return array<string, mixed> */
    private function filters(Request $request): array
    {
        return [
            'event' => $this->stringOrNull($request->query('event')),
            'actor_id' => $this->intOrNull($request->query('actor_id')),
            'branch_id' => $this->intOrNull($request->query('branch_id')),
            'subject_type' => $this->stringOrNull($request->query('subject_type')),
            'subject_id' => $this->intOrNull($request->query('subject_id')),
            'from' => $this->dateOrNull($request->query('from')),
            'to' => $this->dateOrNull($request->query('to')),
            'q' => $this->stringOrNull($request->query('q')),
        ];
    }

    private function stringOrNull(mixed $value): ?string
    {
        return is_string($value) && trim($value) !== '' ? trim($value) : null;
    }

    private function intOrNull(mixed $value): ?int
    {
        return is_numeric($value) ? (int) $value : null;
    }

    private function dateOrNull(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);

        // Reject junk early; a malformed date must not reach the query builder.
        return preg_match('/^\d{4}-\d{2}-\d{2}$/', $trimmed) === 1 ? $trimmed : null;
    }

    /** @return array<string, mixed> */
    private function present(ActivityLog $row): array
    {
        return [
            'id' => $row->id,
            'event' => $row->event,
            'subject_type' => $row->subject_type,
            'subject_id' => $row->subject_id,
            'subject_label' => $row->subject_label,
            'actor_id' => $row->actor_id,
            'actor_type' => $row->actor_type,
            'actor_name' => $row->actor_name,
            'branch_id' => $row->branch_id,
            'description' => $row->description,
            'changes' => $row->changeRows(),
            'batch_id' => $row->batch_id,
            'ip_address' => $row->ip_address,
            'created_at' => $row->created_at?->toIso8601String(),
        ];
    }
}
