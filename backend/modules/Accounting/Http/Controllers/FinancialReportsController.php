<?php

namespace Modules\Accounting\Http\Controllers;

use App\Services\Accounting\FinancialReport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The three statements an accountant actually asks for, in three shapes:
 * JSON for the screen, CSV for the file, HTML for the printer.
 */
class FinancialReportsController extends Controller
{
    public function __construct(private readonly FinancialReport $reports) {}

    public function financialReports(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->reports->build($request)]);
    }

    public function export(Request $request): StreamedResponse
    {
        $report = $this->reports->build($request);
        $csv = $this->reports->toCsv($report);

        $filename = 'accounting-'.$report['type'].'-'.date('Y-m-d').'.csv';

        return response()->streamDownload(function () use ($csv): void {
            echo $csv;
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /**
     * A print view rather than a "print" button.
     *
     * The browser's print dialog on the dashboard prints the sidebar, the header and the
     * buttons; what an auditor needs is the statement on its own page with the period in the
     * header. This returns exactly that, so Cmd-P gives the paper a shop expects.
     */
    public function printable(Request $request): \Illuminate\Http\Response
    {
        $report = $this->reports->build($request);
        $type = (string) $report['type'];
        $title = match ($type) {
            'balance_sheet' => 'ترازنامه',
            'profit_loss' => 'صورت سود و زیان',
            default => 'تراز آزمایشی',
        };

        $rows = $type === 'balance_sheet'
            ? array_merge(
                array_map(fn ($r) => $r + ['group' => 'دارایی‌ها'], $report['assets']->all()),
                array_map(fn ($r) => $r + ['group' => 'بدهی‌ها و سرمایه'], $report['liabilities_equity']->all()),
            )
            : $report['rows']->all();

        $totals = $report['totals'] ?? [];

        return response()->view('accounting.report-print', [
            'title' => $title,
            'report' => $report,
            'rows' => $rows,
            'totals' => $totals,
            'labels' => [
                'debit' => 'جمع بدهکار',
                'credit' => 'جمع بستانکار',
                'difference' => 'اختلاف',
                'revenue' => 'درآمد',
                'expense' => 'هزینه',
                'profit' => 'سود',
            ],
            'printedAt' => now(),
        ]);
    }
}
