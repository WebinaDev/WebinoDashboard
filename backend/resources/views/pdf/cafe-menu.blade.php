<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>{{ $menu?->name ?? $tenant->store_display_name ?? $tenant->name }} — Menu</title>
    <style>
        body { font-family: DejaVu Sans, sans-serif; font-size: 12px; color: #111; }
        h1 { text-align: center; margin-bottom: 24px; }
        h2 { border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-top: 20px; }
        .item { display: flex; justify-content: space-between; margin: 6px 0; }
        .sold-out { opacity: 0.5; text-decoration: line-through; }
        .desc { font-size: 10px; color: #666; margin-right: 8px; }
    </style>
</head>
<body>
    <h1>{{ $menu?->name ?? $tenant->store_display_name ?? $tenant->name }}</h1>

    @php
        $grouped = $products->groupBy(fn ($p) => $p->category?->name ?? '—');
    @endphp

    @foreach ($grouped as $categoryName => $items)
        <h2>{{ $categoryName }}</h2>
        @foreach ($items as $item)
            <div class="item {{ $item->is_sold_out ? 'sold-out' : '' }}">
                <span>
                    <strong>{{ $item->name }}</strong>
                    @if ($item->description)
                        <span class="desc">{{ mb_substr($item->description, 0, 80) }}</span>
                    @endif
                </span>
                <span>{{ number_format($item->price_minor / 10) }} {{ $item->currency }}</span>
            </div>
        @endforeach
    @endforeach
</body>
</html>
