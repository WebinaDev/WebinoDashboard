<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Modules\ModuleSettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Personal to-do list on the dashboard home. Stored per user inside module settings
 * (dashboard.todos_u{id}) so it needs no extra table and stays tenant-scoped.
 */
class DashboardTodoController extends Controller
{
    private const MAX = 100;

    public function index(Request $request, ModuleSettingsService $settings): JsonResponse
    {
        return response()->json(['data' => $this->read($request, $settings)]);
    }

    public function update(Request $request, ModuleSettingsService $settings): JsonResponse
    {
        $data = $request->validate([
            'items' => ['present', 'array', 'max:'.self::MAX],
            'items.*.id' => ['nullable', 'string', 'max:40'],
            'items.*.title' => ['required', 'string', 'max:300'],
            'items.*.done' => ['nullable', 'boolean'],
            'items.*.priority' => ['nullable', 'string', 'in:low,normal,high'],
            'items.*.due_date' => ['nullable', 'date_format:Y-m-d'],
        ]);

        $items = array_map(fn (array $row) => [
            'id' => isset($row['id']) && $row['id'] !== '' ? (string) $row['id'] : (string) Str::ulid(),
            'title' => trim((string) $row['title']),
            'done' => (bool) ($row['done'] ?? false),
            'priority' => $row['priority'] ?? 'normal',
            'due_date' => $row['due_date'] ?? null,
        ], $data['items']);

        $user = $request->user();
        $settings->put((int) $user->tenant_id, 'dashboard', $this->key($request), ['items' => array_values($items)]);

        return response()->json(['data' => array_values($items)]);
    }

    /** @return list<array<string, mixed>> */
    private function read(Request $request, ModuleSettingsService $settings): array
    {
        $stored = $settings->get((int) $request->user()->tenant_id, 'dashboard', $this->key($request), ['items' => []]);

        return array_values(is_array($stored['items'] ?? null) ? $stored['items'] : []);
    }

    private function key(Request $request): string
    {
        return 'todos_u'.(int) $request->user()->id;
    }
}
