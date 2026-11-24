<?php

namespace Modules\Cafe\Services;

use Illuminate\Support\Facades\DB;

/**
 * Where a ticket goes.
 *
 * A station says *who* makes the item; a printer says *where the paper comes out*; a route ties
 * them together. Keeping the three separate is what lets one kitchen have a grill ticket on the
 * line printer and the same items also go to the expediter's station.
 *
 * Resolution order, and it matters:
 *
 *  1. a route naming this station and this document;
 *  2. a route with no station (the catch-all) for this document;
 *  3. nothing — and *nothing* is reported, not guessed. Silently printing a kitchen ticket on
 *     the receipt printer is worse than not printing it: the cook never learns the order
 *     existed and the cashier thinks the kitchen has it.
 */
final class PrintRouter
{
    /**
     * The printers a ticket for `$document` and `$stationId` should come out of.
     *
     * @return list<array<string, mixed>>
     */
    public function printersFor(int $tenantId, ?int $branchId, ?int $stationId, string $document = 'kitchen'): array
    {
        $query = DB::table('cafe_print_routes as r')
            ->join('cafe_printers as p', 'r.printer_id', '=', 'p.id')
            ->where('r.tenant_id', $tenantId)
            ->where('r.is_active', true)
            ->where('p.is_active', true)
            ->where('r.document', $document)
            ->when($branchId !== null, fn ($q) => $q->where(fn ($inner) => $inner
                ->whereNull('p.branch_id')
                ->orWhere('p.branch_id', $branchId)))
            ->orderBy('r.priority')
            ->select([
                'p.id', 'p.name', 'p.kind', 'p.target', 'p.purpose', 'p.paper_width_mm',
                'r.station_id', 'r.priority',
            ]);

        $rows = $query->get();

        // Exact station routes win; a null station is the fallback, never a duplicate.
        $exact = $rows->where('station_id', $stationId)->whereNotNull('station_id');
        if ($exact->isNotEmpty()) {
            return $exact->map(fn ($row) => $this->present($row))->values()->all();
        }

        return $rows->whereNull('station_id')->map(fn ($row) => $this->present($row))->values()->all();
    }

    /**
     * The job an Edge print agent picks up.
     *
     * The agent polls this and prints locally, which is the only way a browser tab can put ink
     * on paper without a driver installed on the counter machine.
     *
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public function job(int $tenantId, ?int $branchId, ?int $stationId, array $payload, string $document = 'kitchen'): array
    {
        $printers = $this->printersFor($tenantId, $branchId, $stationId, $document);

        return [
            'document' => $document,
            'printers' => $printers,
            'layout' => app(ReceiptLayout::class)->get($tenantId),
            'payload' => $payload,
            'routed' => $printers !== [],
            // Said out loud, so the till can show "no printer routed for the bar" instead of
            // pretending the ticket was sent.
            'warning' => $printers === [] ? __('api.cafe_print_no_route') : null,
            'generated_at' => now()->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    private function present(object $row): array
    {
        return [
            'id' => (int) $row->id,
            'name' => $row->name,
            'kind' => $row->kind,
            'target' => $row->target,
            'purpose' => $row->purpose,
            'paper_width_mm' => (int) $row->paper_width_mm,
        ];
    }
}
