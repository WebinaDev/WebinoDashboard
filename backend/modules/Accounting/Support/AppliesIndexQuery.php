<?php

namespace Modules\Accounting\Support;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;

/**
 * Standard index query: filter[field], search, sort, page, per_page.
 * Compatible with spatie/laravel-query-builder when installed.
 */
trait AppliesIndexQuery
{
    /**
     * @param  array<string, string|callable>  $filters  map filter key => column or callback(Builder, value)
     * @param  array<int, string>  $searchColumns
     * @param  array<int, string>  $sortable
     */
    protected function applyIndexQuery(
        Builder $query,
        Request $request,
        array $filters = [],
        array $searchColumns = [],
        array $sortable = ['created_at'],
        string $defaultSort = 'created_at',
        string $defaultDirection = 'desc',
    ): LengthAwarePaginator {
        $filterBag = $request->input('filter', []);
        if (is_array($filterBag)) {
            foreach ($filters as $key => $column) {
                if (! array_key_exists($key, $filterBag) || $filterBag[$key] === '' || $filterBag[$key] === null) {
                    continue;
                }
                $value = $filterBag[$key];
                if (is_callable($column)) {
                    $column($query, $value);
                } else {
                    $query->where($column, $value);
                }
            }
        }

        if ($request->filled('search') && $searchColumns !== []) {
            $term = '%'.$request->string('search').'%';
            $query->where(function (Builder $q) use ($searchColumns, $term) {
                foreach ($searchColumns as $i => $col) {
                    $i === 0 ? $q->where($col, 'like', $term) : $q->orWhere($col, 'like', $term);
                }
            });
        }

        $sort = $request->string('sort', $defaultSort)->toString();
        $direction = strtolower($request->string('direction', $defaultDirection)->toString()) === 'asc' ? 'asc' : 'desc';
        if (! in_array($sort, $sortable, true)) {
            $sort = $defaultSort;
        }
        $query->orderBy($sort, $direction);

        $perPage = min(max((int) $request->input('per_page', 15), 1), 100);
        $page = max((int) $request->input('page', 1), 1);

        return $query->paginate($perPage, ['*'], 'page', $page);
    }

    protected function paginatedJsonResponse(LengthAwarePaginator $paginator): \Illuminate\Http\JsonResponse
    {
        return response()->json([
            'data' => $paginator->items(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
                'from' => $paginator->firstItem(),
                'to' => $paginator->lastItem(),
            ],
            'links' => [
                'first' => $paginator->url(1),
                'last' => $paginator->url($paginator->lastPage()),
                'prev' => $paginator->previousPageUrl(),
                'next' => $paginator->nextPageUrl(),
            ],
        ]);
    }
}
