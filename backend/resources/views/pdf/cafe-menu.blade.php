<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>{{ $menu?->name ?? $tenant->store_display_name ?? $tenant->name }}</title>
    <style>
        body { font-family: DejaVu Sans, sans-serif; font-size: 12px; color: #1c140f; }
        h1 { text-align: center; margin-bottom: 8px; }
        .sub { text-align: center; color: #6b5346; margin-bottom: 24px; }
        h2 { border-bottom: 1px solid #e4d3c5; padding-bottom: 4px; margin-top: 20px; color: #8a4b2f; }
        .item { margin: 8px 0; }
        .row { width: 100%; }
        .sold-out { opacity: 0.55; text-decoration: line-through; }
        .desc { font-size: 10px; color: #666; }
        .price { font-weight: bold; }
        .color .hero { background: #2a1812; color: #fff8f2; padding: 18px; border-radius: 8px; margin-bottom: 16px; }
        .color h1, .color .sub { color: #fff8f2; }
        .thumb { width: 42px; height: 42px; object-fit: cover; border-radius: 6px; }
    </style>
</head>
<body class="{{ ($style ?? 'color') === 'color' ? 'color' : 'simple' }}">
    <div class="{{ ($style ?? 'color') === 'color' ? 'hero' : '' }}">
        <h1>{{ $menu?->name ?? $tenant->store_display_name ?? $tenant->name }}</h1>
        @if ($menu?->description)
            <p class="sub">{{ $menu->description }}</p>
        @endif
    </div>

    @php
        $grouped = $products->groupBy(fn ($p) => $p->category?->name ?? '—');
        $color = ($style ?? 'color') === 'color';
    @endphp

    @foreach ($grouped as $categoryName => $items)
        <h2>{{ $categoryName }}</h2>
        @foreach ($items as $item)
            <div class="item {{ $item->is_sold_out ? 'sold-out' : '' }}">
                <table class="row"><tr>
                    @if ($color && $item->image_url)
                        <td style="width:48px"><img class="thumb" src="{{ $item->image_url }}" alt=""></td>
                    @endif
                    <td>
                        <strong>{{ $item->name }}</strong>
                        @if ($item->is_featured) ★ @endif
                        @if ($item->discount_percent) <span>−{{ $item->discount_percent }}%</span> @endif
                        @if ($item->description)
                            <div class="desc">{{ mb_substr(strip_tags($item->description), 0, 110) }}</div>
                        @endif
                    </td>
                    <td style="text-align:left; white-space:nowrap" class="price">{{ number_format(($item->sale_price_minor ?? $item->price_minor) / 10) }}</td>
                </tr></table>
            </div>
        @endforeach
    @endforeach
</body>
</html>
