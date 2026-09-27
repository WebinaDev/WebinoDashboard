@php
    $theme = in_array($s['label_theme'], ['stacked', 'rows', 'classic', 'modern', 'iran', 'stamp'], true) ? $s['label_theme'] : 'stacked';
    $rowsTheme = $theme === 'rows';
    $iran = $theme === 'iran';
    $size = $s['label_size'];
    $orientation = $s['label_orientation'] === 'portrait' ? 'portrait' : 'landscape';
    $landscape = $orientation === 'landscape';
    if ($size === '100x100') {
        $page = '100mm 100mm';
        $box = 'width: 94mm; height: 94mm;';
    } elseif ($size === 'A5') {
        $page = $landscape ? 'A5 landscape' : 'A5 portrait';
        $box = $landscape ? 'width: 196mm; height: 134mm;' : 'width: 134mm; height: 196mm;';
    } else {
        $page = $landscape ? '150mm 100mm' : '100mm 150mm';
        $box = $landscape ? 'width: 144mm; height: 94mm;' : 'width: 94mm; height: 144mm;';
    }
    $logo = $doc->logo('label');
    $showPostman = ! $rowsTheme && ! empty($s['label_show_postman_placeholder']);
@endphp
<!DOCTYPE html>
<html lang="{{ $config['lang'] }}" dir="{{ $config['dir'] }}">
<head>
    <meta charset="utf-8" />
    <title>{{ $title }}</title>
    <style>
        @include('order-documents.partials.styles')
        @media print { @page { size: {{ $page }}; margin: 0; } }
        .postal-label-container { {{ $box }} box-sizing: border-box; display: flex; flex-direction: column; margin: auto; border: 1px solid var(--border-color); border-radius: {{ $theme === 'modern' ? '0' : 'var(--border-radius)' }}; overflow: hidden; }
        .postal-header { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 2px solid var(--border-color); background: var(--bg-light); flex: 0 0 auto; }
        .postal-header-right { display: flex; align-items: center; gap: 12px; }
        .postal-title { font-size: 18px; font-weight: 700; margin: 0; }
        .order-number { font-size: 12px; color: var(--text-medium); margin-top: 2px; }
        .doc-logo { height: 48px; width: auto; }
        .header-barcode { max-width: 160px; height: auto; }
        .postal-content { flex: 1; min-height: 0; }
        .label-cell { padding: 10px 12px; box-sizing: border-box; overflow: hidden; }
        .empty-cell { background: var(--bg-light); }
        .sender-cell { font-size: 12px; }
        .sender-cell .section-title { font-size: 13px; }
        .sender-cell .address-info, .sender-cell .address-info p { font-size: 12px; line-height: 1.45; }
        .receiver-cell { font-size: 15px; }
        .receiver-cell .section-title { font-size: 16px; font-weight: 700; }
        .receiver-cell .address-info, .receiver-cell .address-info p { font-size: 15px; line-height: 1.55; margin: 4px 0; }
        .section-title { font-weight: 700; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 2px solid var(--border-color); }
        .address-info p { margin: 3px 0; }
        .label-note { font-size: 11px; padding: 6px 10px; border-top: 1px dashed var(--border-color); grid-column: 1 / -1; }
        .label-page { page-break-after: always; }
        .postman-cell { display: flex; }
        .postman-label-placeholder { border: 2px dashed var(--border-color); margin: 4px; padding: 12px 8px; text-align: center; display: flex; flex-direction: column; justify-content: center; align-items: center; flex: 1; min-height: 72px; background: var(--bg-light); }
        .postman-label-text { font-size: 13px; font-weight: 700; }
        .postman-hint { margin-top: 8px; font-size: 11px; font-weight: 400; color: var(--text-medium); }
        .postal-content.orient-landscape { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
        .postal-content.orient-landscape .empty-cell { border-inline-end: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); }
        .postal-content.orient-landscape .sender-cell { border-bottom: 1px solid var(--border-color); }
        .postal-content.orient-landscape .receiver-cell { border-inline-end: 1px solid var(--border-color); }
        .postal-content.orient-portrait { display: flex; flex-direction: column; }
        .postal-content.orient-portrait .empty-cell { display: none; }
        .postal-content.orient-portrait .sender-cell { flex: 0 1 32%; max-height: 35%; border-bottom: 2px solid var(--border-color); }
        .postal-content.orient-portrait .receiver-cell { flex: 1 1 auto; border-bottom: 2px solid var(--border-color); }
        .postal-content.orient-portrait .postman-cell { flex: 0 0 auto; min-height: 80px; }
        .postal-content.theme-rows { display: flex; flex-direction: column; }
        body.theme-rows .postal-content.orient-landscape { grid-template-columns: unset; grid-template-rows: unset; }
        body.theme-rows .postal-content .sender-cell { flex: 0 1 40%; max-height: 40%; width: 100%; border-bottom: 2px solid var(--border-color); border-inline-end: 0; }
        body.theme-rows .postal-content .receiver-cell { flex: 1 1 auto; width: 100%; border-inline-end: 0; border-bottom: 0; }
        body.theme-rows .postal-content .label-note { grid-column: unset; }
        body.theme-iran .section-title { background: var(--accent-color); color: #fff; padding: 4px 8px; border-bottom: 0; }
        body.theme-stamp .postman-label-placeholder { min-height: 96px; border-style: dashed; border-width: 2px; }
        .postcode-boxes { display: inline-flex; gap: 2px; vertical-align: middle; }
        .pc-box { display: inline-block; width: 14px; height: 16px; border: 1px solid #111; text-align: center; font-size: 10px; line-height: 16px; font-family: ui-monospace, monospace; }
        @media print { .postal-label-container { border-radius: 0; } }
    </style>
</head>
<body class="theme-{{ $theme }} orient-{{ $orientation }}" onload="window.print()">
@foreach ($orders as $o)
    @php $ship = $o['ship']; $barcode = ! empty($s['label_show_barcode']) ? $doc->barcode($o['number']) : ''; @endphp
    <div class="postal-label-container label-page orient-{{ $orientation }}">
        <div class="postal-header">
            <div class="postal-header-right">
                @if ($logo !== '')<img src="{{ $logo }}" class="doc-logo" alt="" />@endif
                <div>
                    <h2 class="postal-title">{{ $doc->t('postal_label') }}</h2>
                    <p class="order-number">{{ $doc->t('order_no', ['number' => $o['numDisp']]) }}</p>
                </div>
            </div>
            @if ($barcode !== '')<img class="header-barcode" src="{{ $barcode }}" alt="{{ $doc->t('barcode') }}" />@endif
        </div>
        <div class="postal-content orient-{{ $orientation }}{{ $rowsTheme ? ' theme-rows' : '' }}">
            @unless ($rowsTheme)
                <div class="label-cell empty-cell" aria-hidden="true"></div>
            @endunless
            <div class="label-cell sender-cell party-block">
                <div class="section-title">{{ $doc->t('sender') }}</div>
                <div class="address-info">
                    <strong>{{ $doc->t('name') }}:</strong> {{ $s['sender_name'] }}
                    @if ($s['sender_address'] !== '')<br><strong>{{ $doc->t('address') }}:</strong> {{ $s['sender_address'] }}@endif
                    @if ($s['sender_postcode'] !== '' && ! $iran)<br><strong>{{ $doc->t('postcode') }}:</strong> {{ $doc->n($s['sender_postcode']) }}@endif
                    @if ($s['sender_phone'] !== '')<br><strong>{{ $doc->t('phone') }}:</strong> {{ $doc->n($s['sender_phone']) }}@endif
                    @if ($s['sender_email'] !== '')<br><strong>{{ $doc->t('email') }}:</strong> {{ $s['sender_email'] }}@endif
                </div>
                @if ($iran && $s['sender_postcode'] !== '')
                    <div class="address-info"><span class="postcode-boxes" dir="ltr">@foreach ($doc->postcodeBoxes($s['sender_postcode']) as $ch)<span class="pc-box">{{ $ch }}</span>@endforeach</span></div>
                @endif
            </div>
            <div class="label-cell receiver-cell party-block">
                <div class="section-title">{{ $doc->t('recipient') }}</div>
                <div class="address-info">
                    @if ($ship['name'] !== '')<p><strong>{{ $doc->t('name') }}:</strong> {{ $ship['name'] }}</p>@endif
                    @if ($ship['state_label'] !== '')<p><strong>{{ $doc->t('state') }}:</strong> {{ $ship['state_label'] }}</p>@endif
                    @if ($ship['city'] !== '')<p><strong>{{ $doc->t('city') }}:</strong> {{ $ship['city'] }}</p>@endif
                    @if ($ship['postcode'] !== '')
                        <p><strong>{{ $doc->t('postcode') }}:</strong>
                            @if ($iran)
                                <span class="postcode-boxes" dir="ltr">@foreach ($doc->postcodeBoxes($ship['postcode']) as $ch)<span class="pc-box">{{ $ch }}</span>@endforeach</span>
                            @else
                                {{ $doc->n($ship['postcode']) }}
                            @endif
                        </p>
                    @endif
                    @if ($ship['address'] !== '')<p><strong>{{ $doc->t('address') }}:</strong> {{ $ship['address'] }}</p>@endif
                    @if ($ship['phone'] !== '')<p><strong>{{ $doc->t('phone') }}:</strong> {{ $doc->n($ship['phone']) }}</p>@endif
                    @if ($o['method'] !== '')<p><strong>{{ $doc->t('shipping_method') }}:</strong> {{ $o['method'] }}</p>@endif
                </div>
            </div>
            @if ($showPostman)
                <div class="label-cell postman-cell">
                    <div class="postman-label-placeholder">
                        <div class="postman-label-text">{{ $s['label_postman_title'] }}</div>
                        <div class="postman-label-text postman-hint">{{ $s['label_postman_hint'] }}</div>
                    </div>
                </div>
            @endif
            @if ($s['label_note'] !== '')
                <p class="label-note">{{ $s['label_note'] }}</p>
            @endif
        </div>
    </div>
@endforeach
<div class="print-button-wrapper no-print">
    <a href="javascript:window.print()" class="print-btn">{{ $doc->t('print_label') }}</a>
</div>
</body>
</html>
