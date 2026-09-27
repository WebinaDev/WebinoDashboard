@php
    $size = $s[$kind === 'store' ? 'store_label_size' : 'customer_label_size'] === '100x100' ? '100x100' : '100x70';
    $wide = $size === '100x70';
    $logo = $doc->logo('label');
    $barcode = $doc->barcode($number);
    $title = $doc->t($kind === 'store' ? 'store_label' : 'customer_label');
@endphp
<!DOCTYPE html>
<html lang="{{ $config['lang'] }}" dir="{{ $config['dir'] }}">
<head>
    <meta charset="utf-8" />
    <title>{{ $title }} #{{ $numDisp }}</title>
    <style>
        @include('order-documents.partials.styles')
        @media print { @page { size: {{ $wide ? '100mm 70mm' : '100mm 100mm' }}; margin: 0; } }
        .sticker-label { width: 94mm; min-height: {{ $wide ? '64mm' : '94mm' }}; margin: auto; border: 1px solid #111; padding: 6mm; display: flex; flex-direction: column; justify-content: space-between; }
        .sticker-title { font-size: 13px; font-weight: 700; margin-bottom: 4px; }
        .sticker-label p { font-size: 11px; margin: 2px 0; }
        .sticker-label img { max-width: 100%; height: auto; }
    </style>
</head>
<body onload="window.print()">
<div class="sticker-label">
    <div>
        @if ($logo !== '')<img src="{{ $logo }}" alt="" style="height:22px;width:auto;" />@endif
        <div class="sticker-title">{{ $title }}</div>
        <p>{{ $doc->t('order_no', ['number' => $numDisp]) }}</p>
        @if ($kind === 'store')
            <p><strong>{{ $s['store_name'] }}</strong></p>
            <p>{{ $doc->t('shipping') }}: {{ $method }}</p>
        @else
            <p><strong>{{ $ship['name'] }}</strong></p>
            <p>{{ $doc->addressSummary($ship) }}</p>
            <p>{{ $doc->t('postcode') }}: {{ $doc->n($ship['postcode']) }}</p>
            <p>{{ $doc->t('phone') }}: {{ $doc->n($ship['phone']) }}</p>
        @endif
    </div>
    @if ($barcode !== '')<img src="{{ $barcode }}" alt="" />@endif
</div>
<div class="print-button-wrapper no-print">
    <a href="javascript:window.print()" class="print-btn">{{ $title }}</a>
</div>
</body>
</html>
