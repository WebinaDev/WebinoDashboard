<?php

namespace Modules\Cafe\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Modules\Cafe\Services\IntegrationKeys;

/**
 * Integrations: the QR stickers' measurable side, inbound API keys, outbound webhooks.
 *
 * The QR half is a read model — a scan is recorded by the public endpoint, and everything here
 * answers "is this sticker earning its place on the table". The keys and webhooks half is
 * configuration, and the two are kept apart by capability on the routes.
 */
class CafeIntegrationsController extends Controller
{
    public function __construct(private readonly IntegrationKeys $keys) {}

    // -------------------------------------------------------------------- QR ---

    /**
     * Scan counts per table, and the daily trend.
     *
     * `distinct` and `scans` are both reported on purpose. One guest opening the menu five
     * times is one guest; five guests is five. A sticker that only ever produces the first
     * number is not being used by new people.
     */
    public function qrStats(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;
        $days = min(365, max(1, (int) $request->query('days', 30)));
        $from = now()->subDays($days)->startOfDay();

        $tables = DB::table('cafe_qr_scans')
            ->where('tenant_id', $tenantId)
            ->where('scanned_at', '>=', $from)
            ->whereNotNull('table_code')
            ->groupBy('table_code')
            ->selectRaw('table_code, COUNT(*) as scans, COUNT(DISTINCT visitor_hash) as visitors, MAX(scanned_at) as last_scan')
            ->orderByDesc('scans')
            ->get()
            ->map(fn ($row) => [
                'table_code' => $row->table_code,
                'scans' => (int) $row->scans,
                'visitors' => (int) $row->visitors,
                'last_scan' => $row->last_scan,
            ]);

        $trend = DB::table('cafe_qr_scans')
            ->where('tenant_id', $tenantId)
            ->where('scanned_at', '>=', $from)
            ->groupByRaw('DATE(scanned_at)')
            ->selectRaw('DATE(scanned_at) as day, COUNT(*) as scans')
            ->orderBy('day')
            ->get()
            ->map(fn ($row) => ['day' => $row->day, 'scans' => (int) $row->scans]);

        $total = (int) $tables->sum('scans');

        // A table that has never been scanned is the actionable half of this report, so it is
        // computed rather than left to a person to work out from absence.
        $silent = DB::table('cafe_tables')
            ->where('tenant_id', $tenantId)
            ->whereNotIn('code', $tables->pluck('table_code')->all() ?: ['-'])
            ->pluck('code')
            ->all();

        return response()->json([
            'data' => [
                'days' => $days,
                'tables' => $tables,
                'trend' => $trend,
                'total_scans' => $total,
                'scanned_tables' => $tables->count(),
                'never_scanned' => $silent,
            ],
        ]);
    }

    // --------------------------------------------------------------- webhooks ---

    public function webhooks(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        $hooks = DB::table('cafe_webhooks')
            ->where('tenant_id', $tenantId)
            ->orderBy('name')
            ->get()
            ->map(fn ($row) => [
                'id' => (int) $row->id,
                'name' => $row->name,
                'url' => $row->url,
                'events' => json_decode((string) ($row->events ?? 'null'), true),
                'is_active' => (bool) $row->is_active,
                'last_success_at' => $row->last_success_at,
                'last_failure_at' => $row->last_failure_at,
                'last_error' => $row->last_error,
            ]);

        $deliveries = DB::table('cafe_webhook_deliveries')
            ->where('tenant_id', $tenantId)
            ->orderByDesc('id')
            ->limit(50)
            ->get()
            ->map(fn ($row) => [
                'id' => (int) $row->id,
                'webhook_id' => (int) $row->webhook_id,
                'event' => $row->event,
                'status' => $row->status,
                'response_status' => $row->response_status === null ? null : (int) $row->response_status,
                'attempts' => (int) $row->attempts,
                'error' => $row->error,
                'created_at' => $row->created_at,
            ]);

        return response()->json([
            'data' => [
                'webhooks' => $hooks,
                'deliveries' => $deliveries,
                'events' => IntegrationKeys::EVENTS,
            ],
        ]);
    }

    public function saveWebhook(Request $request): JsonResponse
    {
        $data = $request->validate([
            'id' => ['nullable', 'integer', 'min:1'],
            'name' => ['required', 'string', 'max:120'],
            // https only: a webhook secret over plain http is a secret handed to the network.
            'url' => ['required', 'url:https', 'max:2048'],
            'events' => ['nullable', 'array', 'max:32'],
            'events.*' => [Rule::in(IntegrationKeys::EVENTS)],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $tenantId = (int) $request->user()->tenant_id;

        $payload = [
            'tenant_id' => $tenantId,
            'name' => $data['name'],
            'url' => $data['url'],
            'events' => isset($data['events']) ? json_encode(array_values($data['events']), JSON_UNESCAPED_UNICODE) : null,
            'is_active' => (bool) ($data['is_active'] ?? true),
            'updated_at' => now(),
        ];

        // The secret is created once and never returned again: rotating it would silently break
        // an endpoint that had verified the old one, so rotation is a deliberate new key instead.
        if (! empty($data['id'])) {
            DB::table('cafe_webhooks')->where('tenant_id', $tenantId)->where('id', (int) $data['id'])->update($payload);
            $id = (int) $data['id'];
            $secret = null;
        } else {
            $secret = bin2hex(random_bytes(24));
            $id = (int) DB::table('cafe_webhooks')->insertGetId($payload + [
                'secret' => $secret,
                'created_at' => now(),
            ]);
        }

        return response()->json(['data' => ['id' => $id, 'secret' => $secret]], 201);
    }

    public function destroyWebhook(Request $request, int $webhook): JsonResponse
    {
        $deleted = DB::table('cafe_webhooks')
            ->where('tenant_id', (int) $request->user()->tenant_id)
            ->where('id', $webhook)
            ->delete();

        return response()->json(['data' => ['deleted' => $deleted > 0]]);
    }

    // ---------------------------------------------------------------- API keys ---

    public function apiKeys(Request $request): JsonResponse
    {
        $rows = DB::table('cafe_api_keys')
            ->where('tenant_id', (int) $request->user()->tenant_id)
            ->orderByDesc('id')
            ->get()
            ->map(fn ($row) => [
                'id' => (int) $row->id,
                'name' => $row->name,
                'prefix' => $row->prefix,
                'scopes' => json_decode((string) ($row->scopes ?? '[]'), true) ?: [],
                'last_used_at' => $row->last_used_at,
                'expires_at' => $row->expires_at,
                'revoked_at' => $row->revoked_at,
                'created_at' => $row->created_at,
            ]);

        return response()->json([
            'data' => ['keys' => $rows, 'scopes' => IntegrationKeys::SCOPES],
        ]);
    }

    public function issueKey(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'scopes' => ['required', 'array', 'min:1', 'max:16'],
            'scopes.*' => [Rule::in(IntegrationKeys::SCOPES)],
            'expires_at' => ['nullable', 'date', 'after:now'],
        ]);

        $issued = $this->keys->issue(
            (int) $request->user()->tenant_id,
            (string) $data['name'],
            $data['scopes'],
            (int) $request->user()->id,
            $data['expires_at'] ?? null,
        );

        // The only response that ever carries the key itself.
        return response()->json(['data' => $issued], 201);
    }

    public function revokeKey(Request $request, int $key): JsonResponse
    {
        $updated = DB::table('cafe_api_keys')
            ->where('tenant_id', (int) $request->user()->tenant_id)
            ->where('id', $key)
            ->whereNull('revoked_at')
            ->update(['revoked_at' => now(), 'updated_at' => now()]);

        return response()->json(['data' => ['revoked' => $updated > 0]]);
    }
}
