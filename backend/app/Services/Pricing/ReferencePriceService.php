<?php

namespace App\Services\Pricing;

use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Tenant;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Throwable;

/**
 * Port of WFCP_Reference_Sync + adapters (Digikala API, Technolife/Basalam __NEXT_DATA__, WooCommerce Store API / OG meta).
 *
 * Adapters return: price (in price_unit), price_unit (toman|rial), in_stock, stock_qty, source.
 */
class ReferencePriceService
{
    public const SOURCES = ['digikala', 'technolife', 'basalam', 'woocommerce'];

    public function __construct(protected int $tenantId) {}

    /** @return array<string, mixed> */
    public function settings(): array
    {
        return (new PricingCalculator(PricingSettings::row($this->tenantId)->payload ?? []))->section('reference');
    }

    public static function detectSource(string $url): ?string
    {
        $host = strtolower((string) preg_replace('/^www\./', '', (string) parse_url($url, PHP_URL_HOST)));
        if ($host === '') {
            return null;
        }
        if (str_contains($host, 'digikala.com') && self::digikalaId($url)) {
            return 'digikala';
        }
        if (str_contains($host, 'technolife.') && preg_match('#/product-(\d+)|TLP-(\d+)#i', $url)) {
            return 'technolife';
        }
        if (str_contains($host, 'basalam.com') && preg_match('#/product/(\d+)#', $url)) {
            return 'basalam';
        }

        return 'woocommerce';
    }

    /**
     * Fetch + apply reference data to a product (or variant).
     *
     * @return array<string, mixed>
     */
    public function sync(Product $product, ?ProductVariant $variant = null, ?string $url = null): array
    {
        $target = $variant ?? $product;
        $url = trim((string) ($url ?: $target->reference_url));
        if ($url === '') {
            throw new RuntimeException(__('Reference URL is required.'));
        }
        $settings = $this->settings();
        $source = self::detectSource($url);
        $enabled = (array) ($settings['sources'] ?? []);
        if (! $source || ! PricingCalculator::bool($enabled[$source] ?? false)) {
            throw new RuntimeException(__('This reference source is not supported or is disabled.'));
        }

        $data = match ($source) {
            'digikala' => $this->digikala($url),
            'technolife' => $this->technolife($url),
            'basalam' => $this->basalam($url),
            default => $this->woocommerce($url),
        };

        $applied = $this->apply($product, $variant, $data, $settings);
        $target->forceFill([
            'reference_url' => $url,
            ...($target instanceof Product ? ['reference_source' => $source, 'reference_last_sync' => now()] : []),
        ])->save();

        return array_merge($data, $applied, ['source' => $source, 'url' => $url]);
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  array<string, mixed>  $settings
     * @return array<string, mixed>
     */
    public function apply(Product $product, ?ProductVariant $variant, array $data, array $settings): array
    {
        $target = $variant ?? $product;
        $locked = (bool) ($target->lock_price || $product->lock_price);
        $out = ['purchase_price' => null, 'price_updated' => false, 'stock_updated' => false, 'skipped_price' => false];
        $calc = PricingCalculator::forTenant($this->tenantId);

        $raw = (float) ($data['price'] ?? 0);
        if ($raw > 0) {
            if ($locked) {
                $out['skipped_price'] = true;
            } else {
                $purchase = $this->toPurchasePrice($raw, (string) ($data['price_unit'] ?? 'toman'), $calc);
                if ($purchase > 0) {
                    $retail = (int) round($calc->calculate($purchase, 'retail', [], $target));
                    $target->update(['purchase_price_minor' => (int) round($purchase), 'price_minor' => $retail]);
                    $out['purchase_price'] = (int) round($purchase);
                    $out['retail_price'] = $retail;
                    $out['price_updated'] = true;
                }
            }
        }

        $syncStock = PricingCalculator::bool($settings['sync_stock'] ?? true);
        $stockWhenLocked = PricingCalculator::bool($settings['sync_stock_when_locked'] ?? false);
        if ($syncStock && (! $locked || $stockWhenLocked)) {
            $qty = $data['stock_qty'] ?? null;
            $in = $data['in_stock'] ?? null;
            if (is_numeric($qty)) {
                $qty = max(0, (int) $qty);
                $target->update(['manage_stock' => true, 'stock' => $qty, 'stock_status' => $qty > 0 ? 'instock' : 'outofstock']);
                $out['stock_updated'] = true;
                $out['stock_qty'] = $qty;
            } elseif ($in !== null) {
                $target->update(['stock_status' => $in ? 'instock' : 'outofstock']);
                $out['stock_updated'] = true;
                $out['in_stock'] = (bool) $in;
            }
        }

        if (! $out['price_updated'] && ! $out['stock_updated'] && ! $out['skipped_price']) {
            throw new RuntimeException(__('No price or stock could be read from the reference site.'));
        }
        if ($out['skipped_price'] && ! $out['stock_updated']) {
            throw new RuntimeException(__('Product price is locked; nothing was updated.'));
        }

        return $out;
    }

    /** Port of WFCP_Reference_Currency::to_purchase_price. */
    public function toPurchasePrice(float $amount, string $unit, PricingCalculator $calc): float
    {
        if ($amount <= 0) {
            return 0;
        }
        $toman = $unit === 'rial' ? $amount / 10 : $amount;
        $g = $calc->section('general');
        $rate = (float) ($g['exchange_rate'] ?? 0);
        $fx = PricingCalculator::bool($g['exchange_rate_enabled'] ?? false) && $rate > 0
            && in_array((string) ($g['purchase_currency'] ?? 'display'), ['base', ''], true);
        if ($fx) {
            return round($toman / $rate, 4);
        }
        $currency = strtoupper((string) (Tenant::query()->whereKey($this->tenantId)->value('default_currency') ?: 'IRT'));

        return in_array($currency, ['IRR', 'IR'], true) ? $toman * 10 : $toman;
    }

    /** @return array<string, mixed> */
    protected function digikala(string $url): array
    {
        $pid = self::digikalaId($url);
        $json = $this->json('https://api.digikala.com/v2/product/'.$pid.'/');
        $product = $json['data']['product'] ?? null;
        if (! is_array($product)) {
            throw new RuntimeException(__('Digikala product not found.'));
        }
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);
        $variants = (array) ($product['variants'] ?? []);
        $variant = null;
        if (! empty($query['variant_id'])) {
            foreach ($variants as $v) {
                if ((int) ($v['id'] ?? 0) === (int) $query['variant_id']) {
                    $variant = $v;
                    break;
                }
            }
        }
        $variant ??= is_array($product['default_variant'] ?? null) ? $product['default_variant'] : ($variants[0] ?? null);
        if (! $variant) {
            return ['price' => null, 'price_unit' => 'rial', 'in_stock' => ($product['status'] ?? '') === 'marketable', 'stock_qty' => null];
        }
        $price = (float) ($variant['price']['selling_price'] ?? 0);

        return [
            'price' => $price > 0 ? $price : null,
            'price_unit' => 'rial',
            'in_stock' => ($variant['status'] ?? '') === 'marketable',
            'stock_qty' => null,
        ];
    }

    /** @return array<string, mixed> */
    protected function technolife(string $url): array
    {
        $next = $this->nextData($this->body($url));
        $info = null;
        foreach ((array) ($next['props']['pageProps']['dehydratedState']['queries'] ?? []) as $q) {
            if (is_array($q['state']['data']['product_info'] ?? null)) {
                $info = $q['state']['data']['product_info'];
                break;
            }
        }
        if (! $info) {
            throw new RuntimeException(__('Technolife product info not found.'));
        }
        $items = (array) ($info['color_items'] ?? []);
        $item = null;
        foreach ($items as $it) {
            if ((float) ($it['available'] ?? 0) > 0) {
                $item = $it;
                break;
            }
        }
        $item ??= $items[0] ?? null;
        if (! $item) {
            return ['price' => null, 'price_unit' => 'toman', 'in_stock' => ! empty($info['is_available']), 'stock_qty' => null];
        }
        $price = (float) ($item['discounted_price'] ?? 0) ?: (float) ($item['price'] ?? 0);
        $qty = is_numeric($item['available'] ?? null) && (int) $item['available'] > 0 && (int) $item['available'] < 100000 ? (int) $item['available'] : null;

        return [
            'price' => $price > 0 ? $price : null,
            'price_unit' => 'toman',
            'in_stock' => isset($item['available']) ? (float) $item['available'] > 0 : null,
            'stock_qty' => $qty,
        ];
    }

    /** @return array<string, mixed> */
    protected function basalam(string $url): array
    {
        $next = $this->nextData($this->body($url));
        $product = $next['props']['pageProps']['product'] ?? null;
        if (! is_array($product)) {
            throw new RuntimeException(__('Basalam product not found.'));
        }
        $src = $product;
        $variants = is_array($product['variants'] ?? null) ? $product['variants'] : [];
        if ($variants) {
            $idx = (int) ($product['variantsSelectedIndex'] ?? -1);
            $src = $variants[$idx] ?? $variants[0];
        }
        $price = (float) ($src['price'] ?? 0) ?: (float) ($src['primaryPrice'] ?? 0);
        $inv = isset($src['inventory']) ? (int) $src['inventory'] : null;
        $in = isset($src['isAvailable']) ? (bool) $src['isAvailable'] : ($inv !== null ? $inv > 0 : null);
        if (! $variants && isset($product['canAddToCart']) && ! $product['canAddToCart']) {
            $in = false;
        }

        return [
            'price' => $price > 0 ? $price : null,
            'price_unit' => 'toman',
            'in_stock' => $in,
            'stock_qty' => $inv !== null && $inv >= 0 ? $inv : null,
        ];
    }

    /** @return array<string, mixed> */
    protected function woocommerce(string $url): array
    {
        $parts = parse_url($url);
        $origin = ($parts['scheme'] ?? 'https').'://'.($parts['host'] ?? '');
        $slug = basename(rtrim((string) ($parts['path'] ?? ''), '/'));
        if ($slug !== '') {
            try {
                $list = Http::timeout(15)->acceptJson()->get($origin.'/wp-json/wc/store/v1/products', ['slug' => urldecode($slug)])->json();
                $p = is_array($list) ? ($list[0] ?? null) : null;
                if (is_array($p) && isset($p['prices']['price'])) {
                    $minor = (int) ($p['prices']['currency_minor_unit'] ?? 0);
                    $price = (float) $p['prices']['price'] / (10 ** $minor);
                    $code = strtoupper((string) ($p['prices']['currency_code'] ?? 'IRT'));

                    return [
                        'price' => $price > 0 ? $price : null,
                        'price_unit' => $code === 'IRR' ? 'rial' : 'toman',
                        'in_stock' => (bool) ($p['is_in_stock'] ?? false),
                        'stock_qty' => null,
                    ];
                }
            } catch (Throwable) {
            }
        }

        $html = $this->body($url);
        $price = null;
        if (preg_match('/<meta[^>]+property=["\'](?:product:price:amount|og:price:amount)["\'][^>]+content=["\']([\d.,]+)["\']/i', $html, $m)) {
            $price = (float) str_replace(',', '', $m[1]);
        }
        $currency = preg_match('/<meta[^>]+property=["\'](?:product:price:currency|og:price:currency)["\'][^>]+content=["\']([A-Za-z]+)["\']/i', $html, $c) ? strtoupper($c[1]) : '';
        $in = preg_match('/<meta[^>]+property=["\']product:availability["\'][^>]+content=["\']([^"\']+)["\']/i', $html, $a)
            ? ! str_contains(strtolower($a[1]), 'out') : null;
        $unit = $currency === 'IRR' ? 'rial' : ($currency === '' && $price && $price >= 100000 && ((int) $price % 10) === 0 ? 'rial' : 'toman');

        return ['price' => $price, 'price_unit' => $unit, 'in_stock' => $in, 'stock_qty' => null];
    }

    public static function digikalaId(string $url): int
    {
        return preg_match('#dkp-(\d+)#i', $url, $m) ? (int) $m[1] : 0;
    }

    /** @return array<string, mixed> */
    protected function json(string $url): array
    {
        $res = Http::timeout(20)->acceptJson()->withHeaders(['User-Agent' => 'Mozilla/5.0 (Webino Pricing)'])->get($url);
        if (! $res->successful() || ! is_array($res->json())) {
            throw new RuntimeException(__('Reference request failed (HTTP :status).', ['status' => $res->status()]));
        }

        return $res->json();
    }

    protected function body(string $url): string
    {
        $res = Http::timeout(20)->withHeaders(['User-Agent' => 'Mozilla/5.0 (Webino Pricing)', 'Accept' => 'text/html'])->get($url);
        if (! $res->successful()) {
            throw new RuntimeException(__('Reference request failed (HTTP :status).', ['status' => $res->status()]));
        }

        return $res->body();
    }

    /** @return array<string, mixed> */
    protected function nextData(string $html): array
    {
        if (! preg_match('/<script[^>]+id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s', $html, $m)) {
            throw new RuntimeException(__('Product data (__NEXT_DATA__) not found.'));
        }
        $data = json_decode($m[1], true);
        if (! is_array($data)) {
            throw new RuntimeException(__('Product data (__NEXT_DATA__) not found.'));
        }

        return $data;
    }
}
