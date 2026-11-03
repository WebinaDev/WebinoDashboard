<?php

/**
 * Publish page-builder documents for Limbo / Lyna cafe sites.
 * Usage: php scripts/design-cafe-pages.php limbo|lyna
 */

use App\Models\CmsPage;
use App\Models\Tenant;
use Illuminate\Contracts\Console\Kernel as ConsoleKernel;
use Illuminate\Support\Str;

require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(ConsoleKernel::class)->bootstrap();

$which = $argv[1] ?? 'limbo';
$tenant = Tenant::query()->first();
if (! $tenant) {
    fwrite(STDERR, "No tenant\n");
    exit(1);
}
$tid = (int) $tenant->id;

function wid(string $prefix = 'w'): string
{
    return $prefix.'_'.Str::lower(Str::random(8));
}

function section(array $widgets, bool $full = true): array
{
    return [
        'id' => wid('s'),
        'fullWidth' => $full,
        'columns' => [[
            'id' => wid('c'),
            'span' => 12,
            'widgets' => $widgets,
        ]],
    ];
}

function w(string $type, array $props): array
{
    return ['id' => wid('w'), 'type' => $type, 'props' => $props];
}

function doc(array $sections): array
{
    return ['version' => 2, 'sections' => $sections, 'page_settings' => []];
}

function upsertPage(int $tid, string $slug, string $title, array $document): void
{
    $row = CmsPage::query()->updateOrCreate(
        ['tenant_id' => $tid, 'slug' => $slug],
        [
            'title' => $title,
            'status' => 'published',
            'published' => true,
            'visibility' => 'public',
            'body' => $title,
            'builder_published' => $document,
            'builder_draft' => $document,
        ],
    );
    echo "page {$row->id} /{$slug} ({$title})\n";
}

if ($which === 'limbo') {
    $tone = 'saloon';
    $home = doc([
        section([w('cafe-hero', [
            'eyebrow' => 'VAWAN · ESALMSHAHR',
            'title' => 'LIMBO',
            'text' => 'چراغ‌های گرم، چوب تیره و بوی اسپرسو — سالن غربی واوان برای شب‌هایی که باید طولانی بمانند.',
            'primaryLabel' => 'منوی دیجیتال',
            'primaryHref' => '/menu',
            'secondaryLabel' => 'رزرو میز',
            'secondaryHref' => '/reservations',
            'logo' => '/brand/limbocafe/logo.png',
            'image' => '/themes/cafe-demo/hero/bar.webp',
            'layout' => 'overlay',
            'tone' => $tone,
            'fullBleed' => true,
            'motion' => true,
            'bgImage' => '/themes/cafe-demo/hero/bar.webp',
            'bgOverlay' => '#0e0a08',
            'bgOverlayOpacity' => 58,
        ])]),
        section([w('cafe-category-strip', [
            'title' => 'از کجا شروع کنیم؟',
            'source' => 'live',
            'tone' => $tone,
            'motion' => true,
            'baseHref' => '/menu?category={slug}',
        ])]),
        section([w('cafe-menu-board', [
            'title' => 'منتخب پیشخوان',
            'subtitle' => 'قهوه گرم، برگر دست‌ساز و پیتزا — قیمت‌ها مطابق منوی روز لیمبو',
            'source' => 'live',
            'count' => 10,
            'layout' => 'board',
            'menuHref' => '/menu',
            'menuLabel' => 'مشاهده کامل منو',
            'tone' => $tone,
            'motion' => true,
        ])]),
        section([w('cafe-story', [
            'eyebrow' => 'داستان سالن',
            'title' => 'چوب تیره، برنج طلایی، نور گرم',
            'text' => '',
            'source' => 'venue',
            'image' => '/themes/cafe-demo/gallery/interior-1.webp',
            'tone' => $tone,
            'motion' => true,
        ])]),
        section([w('cafe-gallery', [
            'title' => 'فضای لیمبو',
            'subtitle' => 'سالن، بار و میزهای کنار پنجره',
            'source' => 'live',
            'tone' => $tone,
            'motion' => true,
        ])]),
        section([w('cafe-reserve-cta', [
            'title' => 'میزتان را رزرو کنید',
            'text' => 'برای جمع‌های دوستانه و عصرهای شلوغ واوان، یک رزرو کافی است.',
            'primaryLabel' => 'رزرو آنلاین',
            'primaryHref' => '/reservations',
            'secondaryLabel' => '۰۲۱ ۵۶۲۸ ۸۶۷۷',
            'secondaryHref' => 'tel:02156288677',
            'tone' => $tone,
            'motion' => true,
        ])]),
    ]);
    $menu = doc([
        section([w('cafe-hero', [
            'eyebrow' => 'MENU',
            'title' => 'منوی لیمبو',
            'text' => 'کافه و رستوران — قیمت‌ها به تومان',
            'primaryLabel' => 'سفارش از کاتالوگ',
            'primaryHref' => '/catalogue',
            'secondaryLabel' => 'رزرو',
            'secondaryHref' => '/reservations',
            'layout' => 'overlay',
            'tone' => $tone,
            'fullBleed' => true,
            'motion' => true,
            'image' => '/themes/cafe-demo/gallery/brew-bar.webp',
            'bgOverlay' => '#0e0a08',
            'bgOverlayOpacity' => 70,
        ])]),
        section([w('cafe-menu-board', [
            'title' => 'قهوه و نوشیدنی',
            'subtitle' => 'از منوی کافه لیمبو (ezy)',
            'source' => 'live',
            'count' => 24,
            'category' => 'hot-coffee',
            'layout' => 'board',
            'tone' => $tone,
            'motion' => true,
            'menuHref' => '/catalogue',
            'menuLabel' => 'کاتالوگ کامل',
        ])]),
        section([w('cafe-menu-board', [
            'title' => 'رستوران',
            'subtitle' => 'برگر، پیتزا و سیب‌زمینی',
            'source' => 'live',
            'count' => 24,
            'category' => 'burgers',
            'layout' => 'board',
            'tone' => $tone,
            'motion' => true,
            'menuHref' => '/catalogue',
            'menuLabel' => '',
        ])]),
    ]);
    $about = doc([
        section([w('cafe-story', [
            'eyebrow' => 'ABOUT',
            'title' => 'کافه رستوران لیمبو',
            'text' => '',
            'source' => 'venue',
            'image' => '/themes/cafe-demo/gallery/window.webp',
            'tone' => $tone,
            'motion' => true,
        ])]),
        section([w('cafe-hours', [
            'title' => 'ساعت و آدرس',
            'note' => 'همه‌روزه از ۱۴ تا ۲۳:۴۵',
            'source' => 'live',
            'tone' => $tone,
            'motion' => true,
        ])]),
    ]);
    $gallery = doc([
        section([w('cafe-gallery', [
            'title' => 'گالری',
            'subtitle' => 'نگاهی به سالن غربی لیمبو',
            'source' => 'live',
            'tone' => $tone,
            'motion' => true,
        ])]),
    ]);
    $reservations = doc([
        section([w('cafe-reserve-cta', [
            'title' => 'رزرو میز',
            'text' => 'نام و ساعت را ثبت کنید؛ بعد از تأیید تماس می‌گیریم.',
            'primaryLabel' => 'فرم رزرو پایین صفحه',
            'primaryHref' => '#booking',
            'secondaryLabel' => 'تماس مستقیم',
            'secondaryHref' => 'tel:02156288677',
            'tone' => $tone,
            'motion' => true,
        ])]),
        section([w('cafe-table-booking', [
            'title' => 'فرم رزرو',
            'intro' => 'میزهای سالن اصلی و کنار پنجره',
            'defaultParty' => 2,
            'maxParty' => 12,
            'showHours' => true,
            'showNotes' => true,
            'cta' => 'ثبت رزرو لیمبو',
        ])], false),
        section([w('cafe-hours', [
            'title' => 'ساعت کاری',
            'source' => 'live',
            'tone' => $tone,
            'motion' => true,
        ])]),
    ]);
    $contact = doc([
        section([w('cafe-hours', [
            'title' => 'تماس با لیمبو',
            'note' => 'اسلامشهر · واوان',
            'source' => 'live',
            'tone' => $tone,
            'motion' => true,
        ])]),
        section([w('cafe-reserve-cta', [
            'title' => 'همین حالا رزرو کنید',
            'text' => '',
            'primaryLabel' => 'رزرو میز',
            'primaryHref' => '/reservations',
            'secondaryLabel' => 'اینستاگرام',
            'secondaryHref' => 'https://instagram.com/limbocaferestaurant',
            'tone' => $tone,
            'motion' => true,
        ])]),
    ]);

    upsertPage($tid, 'home', 'خانه', $home);
    upsertPage($tid, 'menu', 'منو', $menu);
    upsertPage($tid, 'about', 'درباره ما', $about);
    upsertPage($tid, 'gallery', 'گالری', $gallery);
    upsertPage($tid, 'reservations', 'رزرو میز', $reservations);
    upsertPage($tid, 'contact', 'تماس', $contact);
    echo "Limbo pages designed.\n";
    exit(0);
}

if ($which === 'lyna') {
    $tone = 'bakery';
    $home = doc([
        section([w('cafe-hero', [
            'eyebrow' => 'ARTISAN BAKERY',
            'title' => 'Lyna',
            'text' => 'آرد تازه، کره واقعی، پسته و کاکائو — قنادی لاینا برای صبح‌هایی که بوی نان خانه را می‌خواهید.',
            'primaryLabel' => 'ویترین امروز',
            'primaryHref' => '/menu',
            'secondaryLabel' => 'داستان لاینا',
            'secondaryHref' => '/about',
            'image' => '/themes/cafe-demo/items/pancake.webp',
            'layout' => 'overlay',
            'tone' => $tone,
            'fullBleed' => true,
            'motion' => true,
            'bgImage' => '/themes/cafe-demo/items/chocolate-cake.webp',
            'bgOverlay' => '#1c110e',
            'bgOverlayOpacity' => 52,
        ])]),
        section([w('cafe-category-strip', [
            'title' => 'از ویترین بردارید',
            'source' => 'live',
            'tone' => $tone,
            'motion' => true,
        ])]),
        section([w('cafe-menu-board', [
            'title' => 'تازه‌های پیشخوان',
            'subtitle' => 'نان، شیرینی تر و کیک روز',
            'source' => 'live',
            'count' => 8,
            'layout' => 'bakery',
            'menuHref' => '/menu',
            'menuLabel' => 'همه محصولات',
            'tone' => $tone,
            'motion' => true,
        ])]),
        section([w('cafe-story', [
            'eyebrow' => 'از تنور تا میز',
            'title' => 'هر روز از صفر',
            'text' => '',
            'source' => 'venue',
            'image' => '/themes/cafe-demo/items/chocolate-cake.webp',
            'tone' => $tone,
            'motion' => true,
        ])]),
        section([w('cafe-gallery', [
            'title' => 'گالری لاینا',
            'source' => 'live',
            'tone' => $tone,
            'motion' => true,
        ])]),
        section([w('cafe-reserve-cta', [
            'title' => 'کیک سفارشی برای مهمانی',
            'text' => 'برای سفارش کیک و شیرینی عمده از یک روز قبل هماهنگ کنید.',
            'primaryLabel' => 'تماس / سفارش',
            'primaryHref' => '/contact',
            'secondaryLabel' => 'منوی کامل',
            'secondaryHref' => '/menu',
            'tone' => $tone,
            'motion' => true,
        ])]),
    ]);
    $menu = doc([
        section([w('cafe-hero', [
            'eyebrow' => 'COUNTER',
            'title' => 'ویترین لاینا',
            'text' => 'نان، شیرینی، کیک و نوشیدنی',
            'primaryLabel' => 'کاتالوگ',
            'primaryHref' => '/catalogue',
            'layout' => 'overlay',
            'tone' => $tone,
            'fullBleed' => true,
            'motion' => true,
            'image' => '/themes/cafe-demo/items/brownie.webp',
            'bgOverlay' => '#1c110e',
            'bgOverlayOpacity' => 60,
        ])]),
        section([w('cafe-menu-board', [
            'title' => 'محصولات',
            'source' => 'live',
            'count' => 24,
            'layout' => 'bakery',
            'tone' => $tone,
            'motion' => true,
            'menuHref' => '/catalogue',
            'menuLabel' => 'سفارش آنلاین',
        ])]),
    ]);
    $about = doc([
        section([w('cafe-story', [
            'eyebrow' => 'LYNA',
            'title' => 'قنادی لاینا',
            'source' => 'venue',
            'text' => '',
            'image' => '/themes/cafe-demo/items/latte.webp',
            'tone' => $tone,
            'motion' => true,
        ])]),
        section([w('cafe-hours', [
            'title' => 'ساعت کاری',
            'source' => 'live',
            'tone' => $tone,
            'motion' => true,
        ])]),
    ]);
    $gallery = doc([
        section([w('cafe-gallery', [
            'title' => 'گالری',
            'source' => 'live',
            'tone' => $tone,
            'motion' => true,
        ])]),
    ]);
    $reservations = doc([
        section([w('cafe-reserve-cta', [
            'title' => 'میز کوچک کنار ویترین',
            'text' => 'برای قهوه و شیرینی می‌توانید میز رزرو کنید.',
            'primaryLabel' => 'رزرو',
            'primaryHref' => '#booking',
            'tone' => $tone,
            'motion' => true,
        ])]),
        section([w('cafe-table-booking', [
            'title' => 'رزرو میز',
            'defaultParty' => 2,
            'maxParty' => 8,
            'showHours' => true,
            'showNotes' => true,
            'cta' => 'ثبت رزرو',
        ])], false),
    ]);
    $contact = doc([
        section([w('cafe-hours', [
            'title' => 'تماس با لاینا',
            'source' => 'live',
            'tone' => $tone,
            'motion' => true,
        ])]),
    ]);

    upsertPage($tid, 'home', 'خانه', $home);
    upsertPage($tid, 'menu', 'منو / ویترین', $menu);
    upsertPage($tid, 'about', 'درباره ما', $about);
    upsertPage($tid, 'gallery', 'گالری', $gallery);
    upsertPage($tid, 'reservations', 'رزرو', $reservations);
    upsertPage($tid, 'contact', 'تماس', $contact);
    echo "Lyna pages designed.\n";
    exit(0);
}

fwrite(STDERR, "Usage: php scripts/design-cafe-pages.php limbo|lyna\n");
exit(1);
