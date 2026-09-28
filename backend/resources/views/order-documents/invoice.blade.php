@php
    $theme = in_array($s['invoice_theme'], ['classic', 'modern', 'band', 'boxed', 'stripe', 'compact', 'landscape'], true) ? $s['invoice_theme'] : 'classic';
    $orientation = ($s['invoice_orientation'] === 'landscape' || $theme === 'landscape') ? 'landscape' : 'portrait';
    $senderFirst = $s['invoice_parties_order'] !== 'recipient_first';
    $banded = in_array($theme, ['band', 'landscape'], true);
    $showImg = ! empty($s['invoice_show_product_image']);
    $showSku = ! empty($s['invoice_show_sku']);
    $logo = $doc->logo('invoice');
    $barcode = ! empty($s['invoice_show_barcode']) ? $doc->barcode($number) : '';
@endphp
<!DOCTYPE html>
<html lang="{{ $config['lang'] }}" dir="{{ $config['dir'] }}">
<head>
    <meta charset="utf-8" />
    <title>{{ $doc->t('invoice_title', ['number' => $numDisp]) }}</title>
    <style>
        @include('order-documents.partials.styles')
        @media print { @page { size: A4 {{ $orientation }}; margin: 0; } }
        .invoice-box { max-width: 1500px; border: 1px solid var(--border-color); border-radius: var(--border-radius); padding: 20px; margin: 0 auto; }
        .invoice-header { display: flex; flex-direction: row; justify-content: space-between; align-items: stretch; gap: 16px; min-height: 100px; padding-bottom: 15px; border-bottom: 2px solid var(--border-color); margin-bottom: 20px; }
        .invoice-logo-wrap { flex: 0 0 auto; display: flex; align-items: stretch; max-width: 42%; min-height: 80px; }
        .invoice-logo { height: 100%; width: auto; max-width: 100%; max-height: 100px; object-fit: contain; }
        .invoice-header-meta { flex: 1; min-width: 0; }
        .invoice-header h2 { font-size: 22px; }
        .invoice-details table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        .invoice-details th, .invoice-details td { border: 1px solid var(--border-color); padding: 12px; text-align: start; font-size: 14px; }
        .invoice-details th { background: var(--bg-light); font-weight: 600; }
        .total-section table { width: 100%; max-width: 400px; margin-inline-start: auto; margin-top: 20px; }
        .total-section td { padding: 8px 0; border: none; }
        .total-section td:last-child { text-align: end; font-weight: 600; }
        .footer { text-align: center; margin-top: 25px; padding-top: 20px; border-top: 2px solid var(--border-color); color: var(--text-medium); }
        .barcode { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
    </style>
</head>
<body class="theme-{{ $theme }} orient-{{ $orientation }}" onload="window.print()">
<div class="invoice-box">
    @if ($banded)
        <div class="doc-band">
            <h2>{{ $doc->t('sales_invoice') }}</h2>
            <p>{{ $doc->t('order_no', ['number' => $numDisp]) }}</p>
        </div>
    @endif
    <div class="invoice-header">
        @if ($logo !== '')
            <div class="invoice-logo-wrap"><img class="invoice-logo" src="{{ $logo }}" alt="" /></div>
        @endif
        <div class="invoice-header-meta">
            @unless ($banded)
                <h2>{{ $doc->t('invoice') }}</h2>
            @endunless
            <p>{{ $doc->t('order_no', ['number' => $numDisp]) }}</p>
            <p>{{ $doc->t('order_date', ['date' => $date]) }}</p>
            @if (! empty($s['invoice_show_status']))
                <p>{{ $doc->t('status', ['status' => $statusLabel]) }}</p>
            @endif
            <div class="barcode">
                @if ($barcode !== '')
                    <img class="invoice-barcode" src="{{ $barcode }}" alt="{{ $doc->t('barcode') }}" style="max-width:120px;margin-top:8px;" />
                @endif
            </div>
        </div>
    </div>
    <div class="invoice-details">
        <table>
            <tr>
                @if ($senderFirst)
                    <th>{{ $doc->t('seller') }}</th><th>{{ $doc->t('buyer') }}</th>
                @else
                    <th>{{ $doc->t('buyer') }}</th><th>{{ $doc->t('seller') }}</th>
                @endif
            </tr>
            <tr>
                @include('order-documents.partials.party', ['party' => $senderFirst ? 'seller' : 'buyer'])
                @include('order-documents.partials.party', ['party' => $senderFirst ? 'buyer' : 'seller'])
            </tr>
        </table>
    </div>
    <div class="invoice-details">
        <table>
            <thead>
                <tr>
                    <th>{{ $doc->t('row') }}</th>
                    @if ($showImg)<th>{{ $doc->t('image') }}</th>@endif
                    @if ($showSku)<th>{{ $doc->t('sku') }}</th>@endif
                    <th>{{ $doc->t('description') }}</th>
                    <th>{{ $doc->t('qty') }}</th>
                    <th>{{ $doc->t('unit_price') }}</th>
                    <th>{{ $doc->t('line_total') }}</th>
                </tr>
            </thead>
            <tbody>
                @foreach ($items as $item)
                    <tr>
                        <td>{{ $doc->n($item['row']) }}</td>
                        @if ($showImg)
                            <td>@if ($item['image'] !== '')<img style="width:80px;height:80px;object-fit:cover;" src="{{ $item['image'] }}" alt="" />@else — @endif</td>
                        @endif
                        @if ($showSku)
                            <td>{{ $item['sku'] !== '' ? $doc->n($item['sku']) : '—' }}</td>
                        @endif
                        <td>{{ $item['name'] }}</td>
                        <td>{{ $doc->n($item['qty']) }}</td>
                        <td>{{ $doc->price($item['unit'], $currency) }}</td>
                        <td>{{ $doc->price($item['total'], $currency) }}</td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    </div>
    <div class="total-section">
        <table>
            <tr><td><strong>{{ $doc->t('subtotal') }}:</strong></td><td>{{ $doc->price($subtotal, $currency) }}</td></tr>
            @if ($discount > 0)
                <tr><td><strong>{{ $doc->t('discount') }}:</strong></td><td>{{ $doc->price($discount, $currency) }}</td></tr>
            @endif
            <tr><td><strong>{{ $doc->t('shipping') }}:</strong></td><td>{{ $method !== '' ? $method.' ' : '' }}({{ $doc->price($shipping, $currency) }})</td></tr>
            @if (($tax ?? 0) > 0)
                <tr><td><strong>{{ $doc->t('tax') }}:</strong></td><td>{{ $doc->price($tax, $currency) }}</td></tr>
            @endif
            @if ($payment !== '')
                <tr><td><strong>{{ $doc->t('payment_method') }}:</strong></td><td>{{ $payment }}</td></tr>
            @endif
            <tr><td><strong>{{ $doc->t('order_total') }}:</strong></td><td>{{ $doc->price($total, $currency) }}</td></tr>
        </table>
    </div>
    <div class="footer">
        <p>{{ $s['invoice_thanks'] }}</p>
        <p>{{ $s['footer_site'] }}</p>
        <a href="javascript:window.print()" class="print-btn">{{ $doc->t('print_invoice') }}</a>
    </div>
</div>
</body>
</html>
