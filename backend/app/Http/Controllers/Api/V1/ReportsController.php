<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Reports\OrderReports;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReportsController extends Controller
{
    public const SECTIONS = [
        'overview', 'revenue', 'orders', 'products', 'variations', 'categories', 'brands',
        'coupons', 'taxes', 'customers', 'downloads', 'stock', 'sales', 'financial',
    ];

    public function __construct(private readonly OrderReports $reports) {}

    public function section(Request $request, string $section): JsonResponse
    {
        if (! in_array($section, self::SECTIONS, true)) {
            return response()->json(['message' => 'Unknown report section'], 404);
        }

        $data = $this->reports->sectionPayload((int) $request->user()->tenant_id, $section, $request);

        return response()->json(['data' => $data]);
    }

    /** Backward-compatible alias used by older clients. */
    public function overview(Request $request): JsonResponse
    {
        return $this->section($request, 'overview');
    }

    public function export(Request $request, string $section): StreamedResponse|JsonResponse
    {
        if (! in_array($section, self::SECTIONS, true)) {
            return response()->json(['message' => 'Unknown report section'], 404);
        }

        $csv = $this->reports->exportCsv((int) $request->user()->tenant_id, $section, $request);
        $filename = 'shop-report-'.$section.'-'.date('Y-m-d').'.csv';

        return response()->streamDownload(function () use ($csv) {
            echo $csv;
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }
}
