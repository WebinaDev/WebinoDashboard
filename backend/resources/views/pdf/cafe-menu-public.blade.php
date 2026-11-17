<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>{{ $title }}</title>
    <style>
        @page { margin: 18mm 14mm; }
        * { box-sizing: border-box; }
        body { font-family: DejaVu Sans, sans-serif; font-size: 11px; color: #23170f; line-height: 1.5; }
        .brand { text-align: center; margin-bottom: 6px; }
        .brand h1 { font-size: 20px; margin: 0; letter-spacing: .5px; }
        .brand .tag { color: #7a6255; font-size: 10px; margin-top: 2px; }
        .meta { display: flex; justify-content: space-between; gap: 10px; color: #7a6255; font-size: 9px; border-top: 1px solid #e7d8cc; border-bottom: 1px solid #e7d8cc; padding: 5px 0; margin: 10px 0 14px; }
        .menu-block { margin-bottom: 14px; }
        .menu-block > h2 { font-size: 13px; margin: 0 0 6px; color: #8a4b2f; border-bottom: 1px dashed #e7d8cc; padding-bottom: 3px; }
        h3.cat { font-size: 11px; margin: 10px 0 4px; color: #3d2a20; text-transform: uppercase; letter-spacing: .4px; }
        .row { display: flex; align-items: baseline; gap: 6px; padding: 3px 0; }
        .lead { flex: 1; border-bottom: 1px dotted #d9c6b8; height: 1em; }
        .name { font-weight: bold; }
        .price { white-space: nowrap; font-weight: bold; direction: ltr; }
        .off { color: #b3261e; font-size: 8px; margin-inline-start: 3px; }
        .tags { color: #7a6255; font-size: 8px; }
        .featured { color: #b07d00; }
        .sold { opacity: .5; text-decoration: line-through; }
        .foot { margin-top: 16px; text-align: center; color: #7a6255; font-size: 9px; border-top: 1px solid #e7d8cc; padding-top: 8px; }
        .footer-note { font-size: 8px; color: #9a8577; margin-top: 6px; }
    </style>
</head>
<body>
    <div class="brand">
        <h1>{{ $title }}</h1>
        @if ($tagline)
            <div class="tag">{{ $tagline }}</div>
        @endif
    </div>

    <div class="meta">
        <span>{{ $generated_at }}</span>
        @if ($hours_line)
            <span>{{ $hours_line }}</span>
        @endif
        @if ($address)
            <span>{{ $address }}</span>
        @endif
    </div>

    @foreach ($groups as $group)
        <div class="menu-block">
            @if ($groups->count() > 1)
                <h2>{{ $group['name'] }}</h2>
            @endif
            @foreach ($group['categories'] as $category)
                <h3 class="cat">{{ $category['name'] }}</h3>
                @foreach ($category['items'] as $item)
                    <div class="row {{ $item['sold_out'] ? 'sold' : '' }}">
                        <span class="name">
                            @if ($item['featured'])<span class="featured">★</span>@endif
                            {{ $item['name'] }}
                        </span>
                        @if ($item['tags'] !== '')
                            <span class="tags">{{ $item['tags'] }}</span>
                        @endif
                        <span class="lead"></span>
                        <span class="price">
                            {{ $item['price'] }}
                            @if ($item['off'] > 0)<span class="off">-{{ $item['off'] }}%</span>@endif
                        </span>
                    </div>
                @endforeach
            @endforeach
        </div>
    @endforeach

    <div class="foot">
        @if ($menu_url)
            {{ $menu_url }}
        @endif
        <div class="footer-note">{{ $allergen_note }}</div>
    </div>
</body>
</html>
