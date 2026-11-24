<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="utf-8">
    <title>{{ $title }}</title>
    <style>
        /* Print-only page: no framework, because a stylesheet that loads from the dashboard
           bundle is the reason the printed page used to come out with the sidebar on it. */
        @page { size: A4; margin: 14mm; }
        * { box-sizing: border-box; }
        body {
            font-family: Vazirmatn, Tahoma, "DejaVu Sans", sans-serif;
            font-size: 12px;
            color: #111;
            margin: 0;
        }
        h1 { font-size: 18px; margin: 0 0 4px; }
        .meta { color: #555; font-size: 11px; margin-bottom: 14px; }
        .meta span + span::before { content: " · "; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ccc; padding: 5px 7px; text-align: right; }
        th { background: #f2f2f2; font-weight: 600; }
        td.num { text-align: left; font-variant-numeric: tabular-nums; direction: ltr; }
        tr.group td { background: #fafafa; font-weight: 600; }
        tfoot td { font-weight: 700; background: #f7f7f7; }
        .footer { margin-top: 18px; font-size: 10px; color: #777; display: flex; justify-content: space-between; }
        .no-print { margin-bottom: 12px; }
        @media print { .no-print { display: none; } }
    </style>
</head>
<body>
    <div class="no-print">
        <button onclick="window.print()">چاپ / Print</button>
    </div>

    <h1>{{ $title }}</h1>
    <div class="meta">
        @if (! empty($report['meta']['from']))
            <span>از {{ $report['meta']['from'] }}</span>
        @endif
        @if (! empty($report['meta']['to']))
            <span>تا {{ $report['meta']['to'] }}</span>
        @endif
        @if (($report['meta']['branch_id'] ?? null) !== null)
            <span>شعبه {{ $report['meta']['branch_id'] }}</span>
        @endif
    </div>

    <table>
        <thead>
            <tr>
                <th style="width:9%">کد</th>
                <th>نام حساب</th>
                <th style="width:13%">بدهکار</th>
                <th style="width:13%">بستانکار</th>
                <th style="width:13%">مانده</th>
            </tr>
        </thead>
        <tbody>
            @php $lastGroup = null; @endphp
            @foreach ($rows as $row)
                @if (isset($row['group']) && $row['group'] !== $lastGroup)
                    <tr class="group"><td colspan="5">{{ $row['group'] }}</td></tr>
                    @php $lastGroup = $row['group']; @endphp
                @endif
                <tr>
                    <td class="num">{{ $row['code'] }}</td>
                    <td>{{ $row['name'] }}</td>
                    <td class="num">{{ number_format((float) $row['debit'], 2) }}</td>
                    <td class="num">{{ number_format((float) $row['credit'], 2) }}</td>
                    <td class="num">{{ number_format((float) $row['balance'], 2) }}</td>
                </tr>
            @endforeach
        </tbody>
        @if (! empty($totals))
            <tfoot>
                @foreach ($totals as $key => $value)
                    <tr>
                        <td colspan="4">{{ $labels[$key] ?? $key }}</td>
                        <td class="num">{{ number_format((float) $value, 2) }}</td>
                    </tr>
                @endforeach
            </tfoot>
        @endif
    </table>

    <div class="footer">
        <span>تاریخ چاپ: {{ $printedAt->format('Y-m-d H:i') }}</span>
        <span>{{ config('app.name') }}</span>
    </div>
</body>
</html>
