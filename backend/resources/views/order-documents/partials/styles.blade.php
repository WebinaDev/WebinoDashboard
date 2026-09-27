{!! $doc->fontFaceCss() !!}
:root {
    --border-color: #e5e7eb;
    --border-radius: 12px;
    --border-radius-sm: 8px;
    --bg-light: #f9fafb;
    --bg-lighter: #f3f4f6;
    --text-dark: #374151;
    --text-medium: #6b7280;
    --accent-color: {{ $s['accent_color'] }};
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { direction: {{ $config['dir'] }}; font-family: {{ $config['font'] }}; padding: 15px; background: #fff; color: var(--text-dark); line-height: 1.6; }
h1,h2,h3 { font-weight: 700; color: var(--text-dark); }
.print-btn, .print-button { display: inline-block; margin: 20px auto; padding: 12px 24px; background: var(--accent-color); color: #fff; border: none; border-radius: var(--border-radius); cursor: pointer; text-decoration: none; font-size: 14px; font-weight: 600; }
.print-button-wrapper { text-align: center; margin: 20px 0; }
@media print {
    @page { margin: 0; }
    html, body { margin: 0; padding: 0; }
    .print-btn, .print-button, .no-print { display: none !important; }
    body { padding: 0; }
}
body.theme-modern .invoice-box, body.theme-modern .container, body.theme-modern .postal-label-container { border-radius: 0; border-color: #111; }
body.theme-modern .invoice-header, body.theme-modern .header, body.theme-modern .postal-header { border-bottom-color: var(--accent-color); }
body.theme-modern { letter-spacing: 0.01em; }
body.theme-modern .invoice-box, body.theme-modern .container { padding: 28px; }
body.theme-modern .invoice-details th, body.theme-modern .item-details th { background: #111; color: #fff; }
body.theme-modern .footer { letter-spacing: 0.02em; }
body.theme-band .doc-band, body.theme-landscape .doc-band { background: var(--accent-color); color: #fff; padding: 14px 18px; margin: -20px -20px 18px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
body.theme-band .doc-band h2, body.theme-band .doc-band p, body.theme-landscape .doc-band h2, body.theme-landscape .doc-band p { color: #fff; margin: 0; }
body.theme-band .invoice-details th, body.theme-band .item-details th, body.theme-landscape .invoice-details th { background: var(--accent-color); color: #fff; border-color: var(--accent-color); }
body.theme-boxed .invoice-header h2 { border: 2px solid var(--accent-color); display: inline-block; padding: 4px 14px; border-radius: 4px; }
body.theme-boxed .invoice-header-meta { border-inline-start: 4px solid var(--accent-color); padding-inline-start: 12px; }
body.theme-stripe .invoice-details tbody tr:nth-child(even), body.theme-stripe .item-details tbody tr:nth-child(even) { background: #f8fafc; }
body.theme-stripe .invoice-details th, body.theme-stripe .item-details th { background: var(--accent-color); color: #fff; }
body.theme-compact .invoice-box, body.theme-compact .container { padding: 10px; }
body.theme-compact .invoice-details th, body.theme-compact .invoice-details td, body.theme-compact .item-details th, body.theme-compact .item-details td { padding: 6px; font-size: 12px; }
body.theme-compact .invoice-header { min-height: 64px; margin-bottom: 10px; padding-bottom: 8px; }
body.theme-landscape .invoice-box { max-width: none; }
@media print { body.orient-landscape .invoice-box { padding: 8mm; } }
