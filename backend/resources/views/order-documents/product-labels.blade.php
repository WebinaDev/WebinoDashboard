@php
    [$w, $h] = array_map('intval', explode('x', $s['product_label_size']) + [1 => 40]);
    $w = $w >= 20 ? $w : 58;
    $h = $h >= 20 ? $h : 40;
@endphp
<!DOCTYPE html>
<html lang="{{ $config['lang'] }}" dir="{{ $config['dir'] }}">
<head>
    <meta charset="utf-8" />
    <title>{{ $doc->t('product_labels') }}</title>
    <style>
        @include('order-documents.partials.styles')
        @media print { @page { size: {{ $w }}mm {{ $h }}mm; margin: 0; } }
        .wh-label { width: {{ $w - 3 }}mm; min-height: {{ $h - 3 }}mm; border: 1px solid #111; padding: 3mm; page-break-after: always; display: flex; flex-direction: column; justify-content: space-between; }
        .wh-name { font-size: 12px; font-weight: 700; line-height: 1.25; }
        .wh-sku, .wh-price { font-size: 10px; }
        .wh-label img { max-width: 100%; height: auto; }
    </style>
</head>
<body onload="window.print()">
@foreach ($rows as $row)
    @php $barcode = $doc->barcode($row['code']); @endphp
    <div class="wh-label">
        <div class="wh-name">{{ $row['name'] }}</div>
        @if ($row['sku'] !== '')
            <div class="wh-sku">{{ $doc->t('sku') }}: {{ $doc->n($row['sku']) }}</div>
        @endif
        @if ($row['price'] !== '')
            <div class="wh-price">{{ $row['price'] }}</div>
        @endif
        @if ($barcode !== '')<img src="{{ $barcode }}" alt="" />@endif
    </div>
@endforeach
</body>
</html>
