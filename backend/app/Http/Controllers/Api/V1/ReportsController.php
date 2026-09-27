<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Reports\OrderReports;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReportsController extends Controller
{
    public const SECTIONS = [
        'overview', 'revenue', 'orders', 'products', 'variations', 'categories',
        'coupons', 'taxes', 'customers', 'downloads', 'stock', 'sales', 'financial',
    ];

    public function __construct(private readonly OrderReports $reports) {}

    public function section(Request $request, string $section): \Illuminate\Http\JsonResponse
    {
        if (! in_array($section, self::SECTIONS, true)) {
            return response()->json(['message' => 'Unknown report section'], 404);
        }

        $tid = (int) $request->user()->tenant_id;
        $params = $this->reports->parseRequest($request);

        if ($section === 'stock') {
            $data = $this->reports->stock(
                $tid,
                (string) $request->query('filter', 'all'),
                max(1, (int) $request->query('page', 1)),
                max(1, min(100, (int) $request->query('per_page', 50))),
                $request->filled('category') ? (int) $request->query('category') : null,
            );

            return response()->json(['data' => $data]);
        }

        $report = $this->reports->buildReport(
            $tid,
            $params['from_ts'],
            $params['to_ts'],
            $params['interval'],
            $params['statuses'],
        );

        $compare = null;
        if ($params['compare'] && $section !== 'stock') {
            $prev = $this->reports->compareRange($params['from_ts'], $params['to_ts']);
            $compare = $this->reports->buildReport(
                $tid,
                $prev['from_ts'],
                $prev['to_ts'],
                $params['interval'],
                $params['statuses'],
            );
        }

        $listSections = ['products', 'variations', 'categories', 'coupons', 'taxes', 'customers', 'downloads'];
        if (in_array($section, $listSections, true)) {
            $data = $this->reports->listSection(
                $report,
                $section,
                max(1, (int) $request->query('page', 1)),
                max(1, min(100, (int) $request->query('per_page', 20))),
                (string) $request->query('search', ''),
            );
            if ($compare) {
                $data['compare'] = $compare['summary'];
            }

            return response()->json(['data' => $data]);
        }

        // overview / revenue / orders / sales / financial share the full aggregate payload
        $data = [
            'currency' => $report['currency'],
            'from' => $report['from'],
            'to' => $report['to'],
            'from_date' => $report['from_date'],
            'to_date' => $report['to_date'],
            'interval' => $report['interval'],
            'statuses' => $report['statuses'],
            'summary' => $report['summary'],
            'series' => $report['series'],
            'by_status' => $report['by_status'],
            'by_payment' => $report['by_payment'],
            'by_source' => $report['by_source'],
            'by_hour' => $report['by_hour'],
            'by_price_tier' => $report['by_price_tier'],
            'heatmap' => $report['heatmap'],
            'top_products' => $report['top_products'],
            'top_categories' => $report['top_categories'],
            'top_customers' => $report['top_customers'],
            'top_coupons' => $report['top_coupons'],
            'top_products_profit' => $report['top_products_profit'],
            'truncated' => $report['truncated'],
            'section' => $section,
        ];
        if ($compare) {
            $data['compare'] = [
                'from' => $compare['from'],
                'to' => $compare['to'],
                'from_date' => $compare['from_date'],
                'to_date' => $compare['to_date'],
                'summary' => $compare['summary'],
                'series' => $compare['series'],
            ];
        }

        return response()->json(['data' => $data]);
    }

    /** Backward-compatible alias used by older clients. */
    public function overview(Request $request): \Illuminate\Http\JsonResponse
    {
        return $this->section($request, 'overview');
    }

    public function export(Request $request, string $section): StreamedResponse|\Illuminate\Http\JsonResponse
    {
        if (! in_array($section, self::SECTIONS, true)) {
            return response()->json(['message' => 'Unknown report section'], 404);
        }

        $tid = (int) $request->user()->tenant_id;
        $params = $this->reports->parseRequest($request);

        if ($section === 'stock') {
            $data = $this->reports->stock($tid, (string) $request->query('filter', 'all'), 1, 5000);
            $rows = array_map(fn ($r) => [
                'id' => $r['id'],
                'name' => $r['name'],
                'sku' => $r['sku'],
                'stock_qty' => $r['stock_qty'],
                'stock_status' => $r['stock_status'],
                'purchase' => $r['prices']['purchase'],
                'current' => $r['prices']['current'],
                'value_purchase' => $r['values']['purchase'],
                'value_current' => $r['values']['current'],
            ], $data['items']);
            $headers = ['id', 'name', 'sku', 'stock_qty', 'stock_status', 'purchase', 'current', 'value_purchase', 'value_current'];
        } else {
            $report = $this->reports->buildReport(
                $tid, $params['from_ts'], $params['to_ts'], $params['interval'], $params['statuses']
            );
            $listSections = ['products', 'variations', 'categories', 'coupons', 'taxes', 'customers', 'downloads'];
            if (in_array($section, $listSections, true)) {
                $listed = $this->reports->listSection($report, $section, 1, 5000);
                $rows = $listed['items'];
                $headers = match ($section) {
                    'coupons' => ['code', 'count', 'discount', 'revenue'],
                    'customers' => ['name', 'email', 'orders', 'revenue', 'aov'],
                    'taxes', 'downloads' => ['name', 'quantity', 'revenue'],
                    default => ['name', 'quantity', 'revenue', 'cogs', 'profit', 'margin_pct'],
                };
            } else {
                $rows = $report['series'];
                $headers = ['key', 'label', 'revenue', 'orders', 'items', 'cogs', 'profit', 'coupons', 'net'];
            }
        }

        $csv = $this->reports->toCsv($rows, $headers);
        $filename = 'report-'.$section.'-'.date('Ymd').'.csv';

        return response()->streamDownload(function () use ($csv) {
            echo $csv;
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }
}
