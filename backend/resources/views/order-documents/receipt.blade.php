@php
    $theme = in_array($s['receipt_theme'], ['classic', 'modern', 'band', 'compact'], true) ? $s['receipt_theme'] : 'classic';
    $logo = $doc->logo('receipt');
    $barcode = ! empty($s['receipt_show_barcode']) ? $doc->barcode($number) : '';
@endphp
<!DOCTYPE html>
<html lang="{{ $config['lang'] }}" dir="{{ $config['dir'] }}">
<head>
    <meta charset="utf-8" />
    <title>{{ $doc->t('receipt_title', ['number' => $numDisp]) }}</title>
    <style>
        @include('order-documents.partials.styles')
        .container { background: #fff; border: 1px solid var(--border-color); border-radius: var(--border-radius); padding: 25px; max-width: 420px; margin: 0 auto; }
        .header { text-align: center; padding-bottom: 15px; border-bottom: 2px solid var(--border-color); margin-bottom: 20px; }
        .header h1 { font-size: 20px; margin: 8px 0; }
        .doc-logo { max-height: 56px; width: auto; }
        .item-details table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        .item-details th, .item-details td { border: 1px solid var(--border-color); padding: 10px; font-size: 14px; text-align: center; }
        .item-details th { background: var(--bg-light); }
        .summary p, .customer-details p { margin: 6px 0; font-size: 14px; color: var(--text-medium); }
        .footer { text-align: center; margin-top: 25px; padding-top: 20px; border-top: 2px solid var(--border-color); }
    </style>
</head>
<body class="theme-{{ $theme }}" onload="window.print()">
<div class="container">
    @if ($theme === 'band')
        <div class="doc-band">
            <h2>{{ $doc->t('store_receipt') }}</h2>
            <p>{{ $doc->t('order_no', ['number' => $numDisp]) }}</p>
        </div>
    @endif
    <div class="header">
        @if ($logo !== '')<img src="{{ $logo }}" class="doc-logo" alt="" />@endif
        @if ($barcode !== '')<br><img class="invoice-barcode" src="{{ $barcode }}" alt="{{ $doc->t('barcode') }}" style="max-width:120px;margin-top:8px;" />@endif
        <h1>{{ $s['store_name'] }}</h1>
        <p>{{ $doc->t('receipt_line', ['number' => $numDisp, 'date' => $dateShort]) }}</p>
    </div>
    <div class="customer-details">
        <p><strong>{{ $doc->t('buyer') }}:</strong> {{ $ship['name'] }}</p>
        <p><strong>{{ $doc->t('address') }}:</strong> {{ $doc->addressSummary($ship) }}</p>
        @if ($ship['postcode'] !== '')
            <p><strong>{{ $doc->t('postcode') }}:</strong> {{ $doc->n($ship['postcode']) }}</p>
        @endif
        @if ($ship['phone'] !== '')
            <p><strong>{{ $doc->t('phone') }}:</strong> {{ $doc->n($ship['phone']) }}</p>
        @endif
    </div>
    @if (! empty($s['receipt_show_items_table']))
        <div class="item-details">
            <table>
                <thead><tr><th>{{ $doc->t('item') }}</th><th>{{ $doc->t('qty') }}</th><th>{{ $doc->t('unit') }}</th><th>{{ $doc->t('total') }}</th></tr></thead>
                <tbody>
                    @foreach ($items as $item)
                        <tr>
                            <td>{{ $item['name'] }}</td>
                            <td>{{ $doc->n($item['qty']) }}</td>
                            <td>{{ $doc->price($item['unit'], $currency) }}</td>
                            <td>{{ $doc->price($item['total'], $currency) }}</td>
                        </tr>
                    @endforeach
                </tbody>
                <tfoot><tr><td colspan="3"><strong>{{ $doc->t('total') }}:</strong></td><td>{{ $doc->price($total, $currency) }}</td></tr></tfoot>
            </table>
        </div>
    @endif
    <div class="summary">
        @if ($method !== '')
            <p><strong>{{ $doc->t('shipping') }}:</strong> {{ $method }}</p>
        @endif
        @if ($payment !== '')
            <p><strong>{{ $doc->t('payment_method') }}:</strong> {{ $payment }}</p>
        @endif
        <p><strong>{{ $doc->t('order_total') }}:</strong> {{ $doc->price($total, $currency) }}</p>
    </div>
    <div class="footer">
        <p>{{ $s['receipt_thanks'] }}</p>
        <p>{{ $s['footer_site'] }}</p>
        <a href="javascript:window.print()" class="print-button">{{ $doc->t('print_receipt') }}</a>
    </div>
</div>
</body>
</html>
