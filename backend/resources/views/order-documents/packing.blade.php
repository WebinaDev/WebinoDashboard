@php
    $theme = in_array($s['packing_theme'], ['classic', 'band', 'compact'], true) ? $s['packing_theme'] : 'classic';
    $logo = $doc->logo('invoice');
    $barcode = $doc->barcode($number);
@endphp
<!DOCTYPE html>
<html lang="{{ $config['lang'] }}" dir="{{ $config['dir'] }}">
<head>
    <meta charset="utf-8" />
    <title>{{ $doc->t('packing_title', ['number' => $numDisp]) }}</title>
    <style>
        @include('order-documents.partials.styles')
        @media print { @page { size: A4 portrait; margin: 0; } }
        .invoice-box { max-width: 900px; border: 1px solid var(--border-color); border-radius: var(--border-radius); padding: 20px; margin: 0 auto; }
        .invoice-header { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
        .invoice-details table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        .invoice-details th, .invoice-details td { border: 1px solid var(--border-color); padding: 8px; text-align: start; font-size: 13px; }
        .invoice-details th { background: var(--bg-light); }
        .sign-row { display: flex; justify-content: space-between; margin-top: 40px; gap: 24px; }
        .sign-box { flex: 1; border-top: 1px solid var(--border-color); padding-top: 8px; font-size: 12px; text-align: center; }
    </style>
</head>
<body class="theme-{{ $theme }}" onload="window.print()">
<div class="invoice-box">
    @if ($theme === 'band')
        <div class="doc-band">
            <h2>{{ $doc->t('packing_slip') }}</h2>
            <p>{{ $doc->t('order_no', ['number' => $numDisp]) }}</p>
        </div>
    @endif
    <div class="invoice-header">
        <div>
            @if ($logo !== '')<img src="{{ $logo }}" class="invoice-logo" style="max-height:72px;width:auto;" alt="" />@endif
            @if ($theme !== 'band')<h2>{{ $doc->t('packing_slip') }}</h2>@endif
            <p>{{ $doc->t('order_no', ['number' => $numDisp]) }}</p>
            <p>{{ $doc->t('order_date', ['date' => $date]) }}</p>
        </div>
        <div>@if ($barcode !== '')<img class="invoice-barcode" src="{{ $barcode }}" alt="{{ $doc->t('barcode') }}" style="max-width:120px;margin-top:8px;" />@endif</div>
    </div>
    <div class="invoice-details">
        <table>
            <tr><th>{{ $doc->t('buyer') }}</th><th>{{ $doc->t('shipping') }}</th></tr>
            <tr>
                <td>
                    {{ $ship['name'] }}<br>
                    {{ $doc->addressSummary($ship) }}<br>
                    {{ $doc->t('postcode') }}: {{ $doc->n($ship['postcode']) }}<br>
                    {{ $doc->t('phone') }}: {{ $doc->n($ship['phone']) }}
                </td>
                <td>{{ $method }}</td>
            </tr>
        </table>
        <table>
            <thead>
                <tr>
                    <th>{{ $doc->t('row') }}</th>
                    <th>{{ $doc->t('image') }}</th>
                    <th>{{ $doc->t('sku') }}</th>
                    <th>{{ $doc->t('description') }}</th>
                    <th>{{ $doc->t('qty') }}</th>
                </tr>
            </thead>
            <tbody>
                @foreach ($items as $item)
                    <tr>
                        <td>{{ $doc->n($item['row']) }}</td>
                        <td>@if ($item['image'] !== '')<img src="{{ $item['image'] }}" alt="" style="width:48px;height:48px;object-fit:cover;" />@else — @endif</td>
                        <td>{{ $item['sku'] !== '' ? $doc->n($item['sku']) : '—' }}</td>
                        <td>{{ $item['name'] }}</td>
                        <td>{{ $doc->n($item['qty']) }}</td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    </div>
    @if ($note !== '')
        <p><strong>{{ $doc->t('customer_note') }}:</strong> {{ $note }}</p>
    @endif
    <div class="sign-row">
        <div class="sign-box">{{ $doc->t('warehouse_signature') }}</div>
        <div class="sign-box">{{ $doc->t('picker_signature') }}</div>
    </div>
    <div class="footer" style="text-align:center;margin-top:20px;">
        <a href="javascript:window.print()" class="print-btn">{{ $doc->t('print_packing') }}</a>
    </div>
</div>
</body>
</html>
