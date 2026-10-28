<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\BlogPost;
use App\Models\Brand;
use App\Models\Category;
use App\Models\CmsPage;
use App\Models\NavMenu;
use App\Models\Product;
use App\Support\PublicCache\FrontendRevalidator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * «منوها» — WordPress-style navigation menus. Admin CRUD (also used inline by the page-builder nav widget)
 * and a public endpoint the storefront header/footer/mobile nav read (falls back to theme defaults when empty).
 */
class NavMenuController extends Controller
{
    private const TYPES = ['custom', 'page', 'category', 'brand', 'product', 'post'];

    private const MAX_ITEMS = 400;

    private const MAX_DEPTH = 3;

    private function tid(Request $request): int
    {
        return (int) $request->user()->tenant_id;
    }

    private function forget(int $tid): void
    {
        Cache::forget("nav-menus:public:$tid");
        FrontendRevalidator::schedule();
    }

    public function index(Request $request): JsonResponse
    {
        $rows = NavMenu::query()->where('tenant_id', $this->tid($request))->orderBy('id')->get();

        return response()->json(['data' => $rows, 'meta' => ['locations' => NavMenu::LOCATIONS]]);
    }

    public function show(Request $request, int $menu): JsonResponse
    {
        return response()->json(['data' => NavMenu::query()->where('tenant_id', $this->tid($request))->findOrFail($menu)]);
    }

    public function store(Request $request): JsonResponse
    {
        $tid = $this->tid($request);
        $data = $this->validated($request, $tid, null);
        $row = NavMenu::create($data + ['tenant_id' => $tid]);
        $this->claimLocations($tid, $row);
        $this->forget($tid);

        return response()->json(['data' => $row->fresh()], 201);
    }

    public function update(Request $request, int $menu): JsonResponse
    {
        $tid = $this->tid($request);
        $row = NavMenu::query()->where('tenant_id', $tid)->findOrFail($menu);
        $row->fill($this->validated($request, $tid, $row))->save();
        $this->claimLocations($tid, $row);
        $this->forget($tid);

        return response()->json(['data' => $row->fresh()]);
    }

    public function destroy(Request $request, int $menu): JsonResponse
    {
        $tid = $this->tid($request);
        NavMenu::query()->where('tenant_id', $tid)->findOrFail($menu)->delete();
        $this->forget($tid);

        return response()->json(['data' => ['deleted' => true]]);
    }

    /** Link picker: pages, product categories, brands, products, blog posts (id, label, slug). */
    public function sources(Request $request): JsonResponse
    {
        $tid = $this->tid($request);
        $type = (string) $request->query('type', 'page');
        $q = trim((string) $request->query('q', ''));
        $like = fn ($query, string $col) => $q === '' ? $query : $query->where($col, 'like', '%'.str_replace(['%', '_'], ['\%', '\_'], $q).'%');
        $rows = match ($type) {
            'category' => $like(Category::query()->where('tenant_id', $tid), 'name')->orderBy('sort_order')->limit(50)->get(['id', 'name as label', 'slug', 'parent_id']),
            'brand' => $like(Brand::query()->where('tenant_id', $tid), 'name')->orderBy('name')->limit(50)->get(['id', 'name as label', 'slug']),
            'product' => $like(Product::query()->where('tenant_id', $tid), 'name')->latest('id')->limit(30)->get(['id', 'name as label', 'slug']),
            'post' => $like(BlogPost::query()->where('tenant_id', $tid), 'title')->latest('id')->limit(30)->get(['id', 'title as label', 'slug']),
            default => $like(CmsPage::query()->where('tenant_id', $tid), 'title')->latest('id')->limit(50)->get(['id', 'title as label', 'slug']),
        };

        return response()->json(['data' => $rows]);
    }

    /** Mega-menu tree auto-filled from product categories (roots → children → grandchildren). */
    public function fromCategories(Request $request): JsonResponse
    {
        $cats = Category::query()->where('tenant_id', $this->tid($request))
            ->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'trash'))
            ->orderBy('sort_order')->orderBy('id')->get(['id', 'parent_id', 'name', 'slug', 'icon_url'])->toArray();
        $byParent = [];
        foreach ($cats as $c) {
            $byParent[(int) ($c['parent_id'] ?? 0)][] = $c;
        }
        $build = function (int $parent, int $depth) use (&$build, $byParent): array {
            if ($depth > self::MAX_DEPTH) {
                return [];
            }

            return array_map(fn ($c) => [
                'id' => 'cat-'.$c['id'],
                'label' => (string) $c['name'],
                'type' => 'category',
                'ref' => (string) $c['slug'],
                'ref_id' => (int) $c['id'],
                'icon' => $c['icon_url'] ?: null,
                'children' => $build((int) $c['id'], $depth + 1),
            ], array_slice($byParent[$parent] ?? [], 0, 60));
        };

        return response()->json(['data' => $build(0, 1)]);
    }

    /** Public: { menus: {slug: items}, locations: {location: items} } — hidden items stripped server-side. */
    public function publicIndex(Request $request): JsonResponse
    {
        $tid = (int) $request->attributes->get('public_tenant_id');
        $data = Cache::remember("nav-menus:public:$tid", 300, function () use ($tid) {
            $menus = [];
            $locations = [];
            foreach (NavMenu::query()->where('tenant_id', $tid)->orderBy('id')->get() as $m) {
                $items = $this->publicItems((array) ($m->items ?? []));
                $menus[$m->slug] = ['id' => $m->id, 'name' => $m->name, 'items' => $items];
                foreach ((array) ($m->locations ?? []) as $loc) {
                    $locations[$loc] ??= $m->slug;
                }
            }

            return ['menus' => $menus, 'locations' => $locations];
        });

        return response()->json(['data' => $data]);
    }

    /** @param  array<int, mixed>  $items */
    private function publicItems(array $items): array
    {
        $out = [];
        foreach ($items as $it) {
            if (! is_array($it) || ($it['visibility'] ?? 'all') === 'hidden') {
                continue;
            }
            $it['children'] = $this->publicItems((array) ($it['children'] ?? []));
            $out[] = $it;
        }

        return $out;
    }

    private function validated(Request $request, int $tid, ?NavMenu $row): array
    {
        $v = $request->validate([
            'name' => [$row ? 'sometimes' : 'required', 'string', 'max:120'],
            'slug' => ['nullable', 'string', 'max:120', 'regex:/^[\p{L}\p{N}_-]+$/u',
                Rule::unique('nav_menus', 'slug')->where('tenant_id', $tid)->ignore($row?->id)],
            'items' => ['nullable', 'array', 'max:'.self::MAX_ITEMS],
            'locations' => ['nullable', 'array'],
            'locations.*' => [Rule::in(NavMenu::LOCATIONS)],
        ]);
        $out = [];
        if (array_key_exists('name', $v)) {
            $out['name'] = trim($v['name']);
        }
        if (! empty($v['slug'])) {
            $out['slug'] = $v['slug'];
        } elseif (! $row) {
            $base = Str::slug($v['name']) ?: 'menu';
            $slug = $base;
            for ($i = 2; NavMenu::query()->where('tenant_id', $tid)->where('slug', $slug)->exists(); $i++) {
                $slug = $base.'-'.$i;
            }
            $out['slug'] = $slug;
        }
        if ($request->has('items')) {
            $count = 0;
            $out['items'] = $this->cleanItems((array) ($v['items'] ?? []), 1, $count);
        }
        if ($request->has('locations')) {
            $out['locations'] = array_values(array_unique($v['locations'] ?? []));
        }

        return $out;
    }

    /** Whitelist item keys, clamp depth/count; custom URLs must be relative paths, http(s), tel: or mailto:. */
    private function cleanItems(array $items, int $depth, int &$count): array
    {
        $out = [];
        foreach ($items as $it) {
            if (! is_array($it) || ++$count > self::MAX_ITEMS) {
                continue;
            }
            $type = in_array($it['type'] ?? '', self::TYPES, true) ? $it['type'] : 'custom';
            $url = trim((string) ($it['url'] ?? ''));
            if ($url !== '' && ! preg_match('#^(/|https?://|tel:|mailto:|\#)#i', $url)) {
                $url = '/'.ltrim($url, '/');
            }
            $vis = in_array($it['visibility'] ?? 'all', ['all', 'guest', 'logged_in', 'desktop', 'mobile', 'hidden'], true) ? ($it['visibility'] ?? 'all') : 'all';
            $out[] = array_filter([
                'id' => substr((string) ($it['id'] ?? Str::random(8)), 0, 40),
                'label' => mb_substr(trim((string) ($it['label'] ?? '')), 0, 120),
                'type' => $type,
                'ref' => isset($it['ref']) ? mb_substr((string) $it['ref'], 0, 255) : null,
                'ref_id' => isset($it['ref_id']) && is_numeric($it['ref_id']) ? (int) $it['ref_id'] : null,
                'url' => $url !== '' ? mb_substr($url, 0, 1024) : null,
                'icon' => isset($it['icon']) && $it['icon'] !== '' ? mb_substr((string) $it['icon'], 0, 1024) : null,
                'badge' => isset($it['badge']) && $it['badge'] !== '' ? mb_substr((string) $it['badge'], 0, 30) : null,
                'badge_color' => isset($it['badge_color']) && preg_match('/^#[0-9a-f]{3,8}$/i', (string) $it['badge_color']) ? $it['badge_color'] : null,
                'new_tab' => ! empty($it['new_tab']) ? true : null,
                'mega' => ! empty($it['mega']) ? true : null,
                'visibility' => $vis !== 'all' ? $vis : null,
                'children' => $depth < self::MAX_DEPTH ? $this->cleanItems((array) ($it['children'] ?? []), $depth + 1, $count) : [],
            ], fn ($val) => $val !== null);
        }

        return $out;
    }

    /** A location belongs to one menu: assigning it here removes it from the others. */
    private function claimLocations(int $tid, NavMenu $row): void
    {
        $mine = (array) ($row->locations ?? []);
        if ($mine === []) {
            return;
        }
        NavMenu::query()->where('tenant_id', $tid)->where('id', '!=', $row->id)->get()->each(function (NavMenu $other) use ($mine) {
            $left = array_values(array_diff((array) ($other->locations ?? []), $mine));
            if ($left !== (array) ($other->locations ?? [])) {
                $other->locations = $left;
                $other->save();
            }
        });
    }
}
