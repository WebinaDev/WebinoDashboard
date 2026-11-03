<?php

/**
 * Site commerce shipping / transport carrier catalog.
 *
 * status:
 *  - live: quote and/or track wired (site works without enabling these)
 *  - scaffold: settings schema + «به زودی»; credentials storable until official driver lands
 *
 * Official optional integrations (Tapin / Postex / COD24) never block zones, flat rates, or packaging.
 */

$field = static fn (string $key, string $type = 'text', bool $secret = false, ?string $hint = null) => array_filter([
    'key' => $key,
    'type' => $type,
    'secret' => $secret,
    'hint' => $hint,
], fn ($v) => $v !== null && $v !== false);

$common = [
    'title' => '',
    'description' => '',
    'sandbox' => true,
    'api_token' => '',
    'api_key' => '',
    'username' => '',
    'password' => '',
    'base_url' => '',
    'tracking_url_template' => '',
];

return [

    'categories' => [
        'aggregator' => ['label_fa' => 'تجمیع‌کننده / رسمی', 'label_en' => 'Official aggregators', 'order' => 10],
        'courier' => ['label_fa' => 'پیک شهری', 'label_en' => 'Urban courier', 'order' => 20],
        'post' => ['label_fa' => 'پست و اکسپرس', 'label_en' => 'Post & express', 'order' => 30],
        'freight' => ['label_fa' => 'باربری و سایر', 'label_en' => 'Freight & other', 'order' => 40],
    ],

    'carriers' => [

        /* ── Official aggregators (optional) ───────────────────────── */
        'tapin' => [
            'category' => 'aggregator',
            'status' => 'live',
            'label_fa' => 'تاپین',
            'label_en' => 'Tapin',
            'supports' => ['quote', 'create', 'track', 'label'],
            'delivery_types' => ['post_pishtaz', 'post_vizhe', 'tipax', 'courier', 'alonomic'],
            'docs_url' => 'https://docs.tapin.ir/',
            'settings_path' => '/dashboard/settings/shop/shipping/tapin',
            'required' => ['token', 'shop_id'],
            'defaults' => array_merge($common, [
                'title' => 'تاپین',
                'base_url' => 'https://api.tapin.ir',
                'token' => '',
                'shop_id' => '',
            ]),
            'fields' => [
                $field('title'),
                $field('description', 'textarea'),
            ],
            'note' => 'Full settings live under Shipping → Tapin.',
        ],

        'postex' => [
            'category' => 'aggregator',
            'status' => 'scaffold',
            'label_fa' => 'پستِکس',
            'label_en' => 'Postex',
            'supports' => ['quote', 'create', 'track', 'label'],
            'delivery_types' => ['post_pishtaz', 'post_vizhe'],
            'docs_url' => 'https://postex.ir/service/api',
            'required' => ['api_token'],
            'defaults' => array_merge($common, [
                'title' => 'پستِکس',
                'base_url' => 'https://api.postex.ir',
                'tracking_url_template' => 'https://postex.ir/tracking/{code}',
            ]),
            'fields' => [
                $field('base_url'),
                $field('api_token', 'password', true),
                $field('username'),
                $field('password', 'password', true),
                $field('sandbox', 'switch'),
                $field('tracking_url_template'),
                $field('title'),
                $field('description', 'textarea'),
            ],
        ],

        'cod24' => [
            'category' => 'aggregator',
            'status' => 'scaffold',
            'label_fa' => 'COD24',
            'label_en' => 'COD24',
            'supports' => ['quote', 'create', 'track'],
            'delivery_types' => ['post_pishtaz', 'courier'],
            'docs_url' => null,
            'required' => ['api_token'],
            'defaults' => array_merge($common, [
                'title' => 'COD24',
                'base_url' => '',
            ]),
            'fields' => [
                $field('base_url'),
                $field('api_token', 'password', true),
                $field('api_key', 'password', true),
                $field('sandbox', 'switch'),
                $field('tracking_url_template'),
                $field('title'),
                $field('description', 'textarea'),
            ],
        ],

        /* ── Urban courier ─────────────────────────────────────────── */
        'snapp' => [
            'category' => 'courier',
            'status' => 'live',
            'label_fa' => 'اسنپ‌باکس / اکسپرس',
            'label_en' => 'Snapp Box / Express',
            'supports' => ['track'],
            'delivery_types' => ['courier_snapp'],
            'docs_url' => 'https://developer.snapp.ir/',
            'required' => ['api_token'],
            'defaults' => array_merge($common, [
                'title' => 'اسنپ‌باکس',
                'base_url' => 'https://api.snapp.box',
                'tracking_url_template' => 'https://app.snapp.box/tracking/{code}',
            ]),
            'fields' => [
                $field('base_url'),
                $field('api_token', 'password', true),
                $field('tracking_url_template'),
                $field('title'),
                $field('description', 'textarea'),
            ],
        ],

        'tapsi' => [
            'category' => 'courier',
            'status' => 'scaffold',
            'label_fa' => 'تپسی',
            'label_en' => 'Tapsi',
            'supports' => ['quote', 'create', 'track'],
            'delivery_types' => ['courier_tapsi'],
            'docs_url' => null,
            'required' => ['api_token'],
            'defaults' => array_merge($common, ['title' => 'تپسی']),
            'fields' => [
                $field('base_url'),
                $field('api_token', 'password', true),
                $field('tracking_url_template'),
                $field('title'),
            ],
        ],

        'tapsi_auto' => [
            'category' => 'courier',
            'status' => 'scaffold',
            'label_fa' => 'تپسی‌اتو',
            'label_en' => 'Tapsi Auto',
            'supports' => ['quote', 'create', 'track'],
            'delivery_types' => ['courier_tapsi_auto'],
            'docs_url' => null,
            'required' => ['api_token'],
            'defaults' => array_merge($common, ['title' => 'تپسی‌اتو']),
            'fields' => [
                $field('base_url'),
                $field('api_token', 'password', true),
                $field('tracking_url_template'),
                $field('title'),
            ],
        ],

        'alopeyk' => [
            'category' => 'courier',
            'status' => 'scaffold',
            'label_fa' => 'الوپیک',
            'label_en' => 'AloPeyk',
            'supports' => ['quote', 'create', 'track'],
            'delivery_types' => ['courier_alopeyk'],
            'docs_url' => 'https://docs.alopeyk.com/',
            'required' => ['api_token'],
            'defaults' => array_merge($common, [
                'title' => 'الوپیک',
                'base_url' => 'https://api.alopeyk.com',
            ]),
            'fields' => [
                $field('base_url'),
                $field('api_token', 'password', true),
                $field('tracking_url_template'),
                $field('title'),
            ],
        ],

        'zap' => [
            'category' => 'courier',
            'status' => 'scaffold',
            'label_fa' => 'زپ',
            'label_en' => 'Zap',
            'supports' => ['quote', 'create', 'track'],
            'delivery_types' => ['courier_zap'],
            'docs_url' => null,
            'required' => ['api_token'],
            'defaults' => array_merge($common, ['title' => 'زپ']),
            'fields' => [
                $field('base_url'),
                $field('api_token', 'password', true),
                $field('tracking_url_template'),
                $field('title'),
            ],
        ],

        'miyare' => [
            'category' => 'courier',
            'status' => 'scaffold',
            'label_fa' => 'میاره',
            'label_en' => 'Miyare',
            'supports' => ['quote', 'create', 'track'],
            'delivery_types' => ['courier_miyare'],
            'docs_url' => null,
            'required' => ['api_token'],
            'defaults' => array_merge($common, ['title' => 'میاره']),
            'fields' => [
                $field('base_url'),
                $field('api_token', 'password', true),
                $field('tracking_url_template'),
                $field('title'),
            ],
        ],

        'dedicated_courier' => [
            'category' => 'courier',
            'status' => 'live',
            'label_fa' => 'پیک اختصاصی فروشگاه',
            'label_en' => 'Dedicated store courier',
            'supports' => ['quote', 'track'],
            'delivery_types' => ['courier_dedicated'],
            'docs_url' => null,
            'local' => true,
            'required' => [],
            'defaults' => array_merge($common, [
                'title' => 'پیک اختصاصی',
                'base_cost' => 0,
                'per_kg' => 0,
                'city_rates' => [],
                'tracking_url_template' => '',
            ]),
            'fields' => [
                $field('title'),
                $field('description', 'textarea'),
                $field('base_cost', 'number'),
                $field('per_kg', 'number'),
                $field('tracking_url_template'),
            ],
        ],

        /* ── Post & express ────────────────────────────────────────── */
        'post' => [
            'category' => 'post',
            'status' => 'live',
            'label_fa' => 'شرکت ملی پست',
            'label_en' => 'Iran Post',
            'supports' => ['track'],
            'delivery_types' => ['post_pishtaz', 'post_vizhe'],
            'docs_url' => 'https://tracking.post.ir/',
            'local' => true,
            'required' => [],
            'defaults' => array_merge($common, [
                'title' => 'پست',
                'tracking_url_template' => 'https://tracking.post.ir/?code={code}',
            ]),
            'fields' => [
                $field('title'),
                $field('tracking_url_template'),
                $field('description', 'textarea'),
            ],
        ],

        'tipax' => [
            'category' => 'post',
            'status' => 'scaffold',
            'label_fa' => 'تیپاکس',
            'label_en' => 'Tipax',
            'supports' => ['quote', 'create', 'track', 'label'],
            'delivery_types' => ['tipax'],
            'docs_url' => 'https://document.tipaxapi.org/',
            'required' => ['api_key', 'username', 'password'],
            'defaults' => array_merge($common, [
                'title' => 'تیپاکس',
                'base_url' => 'https://omapi.tipax.ir',
                'tracking_url_template' => 'https://tipaxco.com/tracking?code={code}',
            ]),
            'fields' => [
                $field('base_url'),
                $field('api_key', 'password', true),
                $field('username'),
                $field('password', 'password', true),
                $field('sandbox', 'switch'),
                $field('tracking_url_template'),
                $field('title'),
            ],
        ],

        'alonomic' => [
            'category' => 'post',
            'status' => 'scaffold',
            'label_fa' => 'الونومیک',
            'label_en' => 'Alonomic',
            'supports' => ['quote', 'create', 'track'],
            'delivery_types' => ['alonomic'],
            'docs_url' => null,
            'required' => ['api_token'],
            'defaults' => array_merge($common, [
                'title' => 'الونومیک',
                'note' => 'Also available via Tapin when enabled.',
            ]),
            'fields' => [
                $field('base_url'),
                $field('api_token', 'password', true),
                $field('tracking_url_template'),
                $field('title'),
            ],
        ],

        'mahex' => [
            'category' => 'post',
            'status' => 'scaffold',
            'label_fa' => 'ماهکس',
            'label_en' => 'Mahex',
            'supports' => ['quote', 'create', 'track'],
            'delivery_types' => ['mahex'],
            'docs_url' => null,
            'required' => ['api_token'],
            'defaults' => array_merge($common, [
                'title' => 'ماهکس',
                'tracking_url_template' => 'https://mahex.com/tracking?code={code}',
            ]),
            'fields' => [
                $field('base_url'),
                $field('api_token', 'password', true),
                $field('tracking_url_template'),
                $field('title'),
            ],
        ],

        'chapar' => [
            'category' => 'post',
            'status' => 'scaffold',
            'label_fa' => 'چاپار',
            'label_en' => 'Chapar',
            'supports' => ['quote', 'create', 'track'],
            'delivery_types' => ['chapar'],
            'docs_url' => null,
            'required' => ['api_token'],
            'defaults' => array_merge($common, [
                'title' => 'چاپار',
                'tracking_url_template' => 'https://chaparnet.com/tracking?code={code}',
            ]),
            'fields' => [
                $field('base_url'),
                $field('api_token', 'password', true),
                $field('tracking_url_template'),
                $field('title'),
            ],
        ],

        'padro' => [
            'category' => 'post',
            'status' => 'scaffold',
            'label_fa' => 'پادرو',
            'label_en' => 'Padro',
            'supports' => ['quote', 'create', 'track'],
            'delivery_types' => ['padro'],
            'docs_url' => null,
            'required' => ['api_token'],
            'defaults' => array_merge($common, ['title' => 'پادرو']),
            'fields' => [
                $field('base_url'),
                $field('api_token', 'password', true),
                $field('tracking_url_template'),
                $field('title'),
            ],
        ],

        'postbar' => [
            'category' => 'post',
            'status' => 'scaffold',
            'label_fa' => 'پست‌بار',
            'label_en' => 'Postbar',
            'supports' => ['quote', 'create', 'track'],
            'delivery_types' => ['postbar'],
            'docs_url' => null,
            'required' => ['api_token'],
            'defaults' => array_merge($common, ['title' => 'پست‌بار']),
            'fields' => [
                $field('base_url'),
                $field('api_token', 'password', true),
                $field('tracking_url_template'),
                $field('title'),
            ],
        ],

        'boxit' => [
            'category' => 'post',
            'status' => 'scaffold',
            'label_fa' => 'باکسیت',
            'label_en' => 'Boxit',
            'supports' => ['quote', 'create', 'track'],
            'delivery_types' => ['boxit'],
            'docs_url' => null,
            'required' => ['api_token'],
            'defaults' => array_merge($common, ['title' => 'باکسیت']),
            'fields' => [
                $field('base_url'),
                $field('api_token', 'password', true),
                $field('tracking_url_template'),
                $field('title'),
            ],
        ],

        'decapost' => [
            'category' => 'post',
            'status' => 'scaffold',
            'label_fa' => 'دکاپست',
            'label_en' => 'Decapost',
            'supports' => ['quote', 'create', 'track'],
            'delivery_types' => ['decapost'],
            'docs_url' => null,
            'required' => ['api_token'],
            'defaults' => array_merge($common, ['title' => 'دکاپست']),
            'fields' => [
                $field('base_url'),
                $field('api_token', 'password', true),
                $field('tracking_url_template'),
                $field('title'),
            ],
        ],

        /* ── Freight ───────────────────────────────────────────────── */
        'barbari' => [
            'category' => 'freight',
            'status' => 'live',
            'label_fa' => 'باربری',
            'label_en' => 'Freight / Barbari',
            'supports' => ['quote', 'track'],
            'delivery_types' => ['freight'],
            'docs_url' => null,
            'local' => true,
            'required' => [],
            'defaults' => array_merge($common, [
                'title' => 'باربری',
                'base_cost' => 0,
                'per_kg' => 0,
                'tracking_url_template' => '',
            ]),
            'fields' => [
                $field('title'),
                $field('description', 'textarea'),
                $field('base_cost', 'number'),
                $field('per_kg', 'number'),
                $field('tracking_url_template'),
            ],
        ],
    ],
];
