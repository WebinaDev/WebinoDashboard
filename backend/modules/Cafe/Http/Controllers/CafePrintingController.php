<?php

namespace Modules\Cafe\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Modules\Cafe\Services\PrintRouter;
use Modules\Cafe\Services\ReceiptLayout;

/**
 * Printing: the printers, what they are wired to, and how a receipt looks.
 *
 * A tenant's printer list is small and its routes are small, so these endpoints return whole
 * lists rather than pages. The settings screen edits both in one place, and a half-saved routing
 * table is a kitchen printing the wrong station's tickets.
 */
class CafePrintingController extends Controller
{
    public function __construct(
        private readonly PrintRouter $router,
        private readonly ReceiptLayout $layout,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        $printers = DB::table('cafe_printers')
            ->where('tenant_id', $tenantId)
            ->orderBy('name')
            ->get()
            ->map(fn ($row) => [
                'id' => (int) $row->id,
                'branch_id' => $row->branch_id === null ? null : (int) $row->branch_id,
                'name' => $row->name,
                'kind' => $row->kind,
                'target' => $row->target,
                'purpose' => $row->purpose,
                'paper_width_mm' => (int) $row->paper_width_mm,
                'is_active' => (bool) $row->is_active,
                'note' => $row->note,
            ]);

        $routes = DB::table('cafe_print_routes as r')
            ->join('cafe_printers as p', 'r.printer_id', '=', 'p.id')
            ->where('r.tenant_id', $tenantId)
            ->orderBy('r.priority')
            ->select(['r.*', 'p.name as printer_name'])
            ->get()
            ->map(fn ($row) => [
                'id' => (int) $row->id,
                'printer_id' => (int) $row->printer_id,
                'printer_name' => $row->printer_name,
                'station_id' => $row->station_id === null ? null : (int) $row->station_id,
                'document' => $row->document,
                'priority' => (int) $row->priority,
                'is_active' => (bool) $row->is_active,
            ]);

        return response()->json([
            'data' => [
                'printers' => $printers,
                'routes' => $routes,
                'layout' => $this->layout->get($tenantId),
            ],
        ]);
    }

    public function savePrinter(Request $request): JsonResponse
    {
        $data = $request->validate([
            'id' => ['nullable', 'integer', 'min:1'],
            'branch_id' => ['nullable', 'integer'],
            'name' => ['required', 'string', 'max:120'],
            'kind' => ['required', Rule::in(['edge', 'network'])],
            'target' => ['required', 'string', 'max:255'],
            'purpose' => ['required', Rule::in(['receipt', 'kitchen', 'label'])],
            'paper_width_mm' => ['nullable', 'integer', Rule::in([58, 76, 80, 112])],
            'is_active' => ['nullable', 'boolean'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $tenantId = (int) $request->user()->tenant_id;

        $payload = [
            'tenant_id' => $tenantId,
            'branch_id' => $data['branch_id'] ?? null,
            'name' => $data['name'],
            'kind' => $data['kind'],
            'target' => $data['target'],
            'purpose' => $data['purpose'],
            'paper_width_mm' => (int) ($data['paper_width_mm'] ?? 80),
            'is_active' => (bool) ($data['is_active'] ?? true),
            'note' => $data['note'] ?? null,
            'updated_at' => now(),
        ];

        if (! empty($data['id'])) {
            DB::table('cafe_printers')
                ->where('tenant_id', $tenantId)
                ->where('id', (int) $data['id'])
                ->update($payload);
            $id = (int) $data['id'];
        } else {
            $id = (int) DB::table('cafe_printers')->insertGetId($payload + ['created_at' => now()]);
        }

        return response()->json(['data' => ['id' => $id]], 201);
    }

    public function destroyPrinter(Request $request, int $printer): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        // Routes go with the printer: an orphaned route is a ticket that goes nowhere.
        DB::table('cafe_print_routes')->where('tenant_id', $tenantId)->where('printer_id', $printer)->delete();
        $deleted = DB::table('cafe_printers')->where('tenant_id', $tenantId)->where('id', $printer)->delete();

        return response()->json(['data' => ['deleted' => $deleted > 0]]);
    }

    public function saveRoute(Request $request): JsonResponse
    {
        $data = $request->validate([
            'id' => ['nullable', 'integer', 'min:1'],
            'printer_id' => ['required', 'integer'],
            'station_id' => ['nullable', 'integer'],
            'document' => ['required', Rule::in(['receipt', 'kitchen', 'label'])],
            'priority' => ['nullable', 'integer', 'min:1', 'max:999'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $tenantId = (int) $request->user()->tenant_id;

        // Both ends must belong to this tenant; otherwise a route could point another shop's
        // printer at this shop's tickets.
        abort_unless(
            DB::table('cafe_printers')->where('tenant_id', $tenantId)->where('id', (int) $data['printer_id'])->exists(),
            404,
        );

        if (! empty($data['station_id'])) {
            abort_unless(
                DB::table('cafe_kitchen_stations')->where('tenant_id', $tenantId)->where('id', (int) $data['station_id'])->exists(),
                404,
            );
        }

        $payload = [
            'tenant_id' => $tenantId,
            'printer_id' => (int) $data['printer_id'],
            'station_id' => $data['station_id'] ?? null,
            'document' => $data['document'],
            'priority' => (int) ($data['priority'] ?? 100),
            'is_active' => (bool) ($data['is_active'] ?? true),
            'updated_at' => now(),
        ];

        if (! empty($data['id'])) {
            DB::table('cafe_print_routes')->where('tenant_id', $tenantId)->where('id', (int) $data['id'])->update($payload);
            $id = (int) $data['id'];
        } else {
            $id = (int) DB::table('cafe_print_routes')->insertGetId($payload + ['created_at' => now()]);
        }

        return response()->json(['data' => ['id' => $id]], 201);
    }

    public function destroyRoute(Request $request, int $route): JsonResponse
    {
        $deleted = DB::table('cafe_print_routes')
            ->where('tenant_id', (int) $request->user()->tenant_id)
            ->where('id', $route)
            ->delete();

        return response()->json(['data' => ['deleted' => $deleted > 0]]);
    }

    /**
     * The job the Edge agent prints.
     *
     * Polled by a small local process on the counter machine, which is the only way a browser
     * reaches a thermal printer. Returns an empty printer list rather than an error when nothing
     * is routed, so the agent can idle quietly.
     */
    public function job(Request $request): JsonResponse
    {
        $data = $request->validate([
            'branch_id' => ['nullable', 'integer'],
            'station_id' => ['nullable', 'integer'],
            'document' => ['nullable', Rule::in(['receipt', 'kitchen', 'label'])],
        ]);

        $tenantId = (int) $request->user()->tenant_id;

        return response()->json([
            'data' => $this->router->job(
                $tenantId,
                isset($data['branch_id']) ? (int) $data['branch_id'] : null,
                isset($data['station_id']) ? (int) $data['station_id'] : null,
                (array) $request->input('payload', []),
                (string) ($data['document'] ?? 'kitchen'),
            ),
        ]);
    }

    public function layoutShow(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->layout->get((int) $request->user()->tenant_id),
        ]);
    }

    public function layoutUpdate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'header_title' => ['nullable', 'string', 'max:120'],
            'footer_note' => ['nullable', 'string', 'max:255'],
            'show_logo' => ['nullable', 'boolean'],
            'show_branch_address' => ['nullable', 'boolean'],
            'show_branch_phone' => ['nullable', 'boolean'],
            'show_customer' => ['nullable', 'boolean'],
            'show_cashier' => ['nullable', 'boolean'],
            'show_table' => ['nullable', 'boolean'],
            'show_tax_number' => ['nullable', 'boolean'],
            'show_item_notes' => ['nullable', 'boolean'],
            'show_qr' => ['nullable', 'boolean'],
            'qr_caption' => ['nullable', 'string', 'max:120'],
            'paper_width_mm' => ['nullable', 'integer', Rule::in([58, 76, 80, 112])],
            'copies' => ['nullable', 'integer', 'min:1', 'max:5'],
            'kitchen_hides_prices' => ['nullable', 'boolean'],
        ]);

        return response()->json([
            'data' => $this->layout->put((int) $request->user()->tenant_id, $data),
        ]);
    }
}
