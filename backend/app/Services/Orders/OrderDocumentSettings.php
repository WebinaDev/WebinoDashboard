<?php

namespace App\Services\Orders;

use App\Models\Tenant;
use App\Services\Modules\ModuleSettingsService;

/**
 * Printable order document settings (invoice, receipt, postal label, packing slip, stickers,
 * product labels), stored under settings / shop.invoices.
 */
final class OrderDocumentSettings
{
    public const MODULE = 'settings';

    public const KEY = 'shop.invoices';

    public const TYPES = ['invoice', 'receipt', 'label', 'packing', 'customer_label', 'store_label', 'product_label'];

    public const ENUMS = [
        'invoice_parties_order' => ['sender_first', 'recipient_first'],
        'label_parties_order' => ['sender_first', 'recipient_first'],
        'label_orientation' => ['portrait', 'landscape'],
        'invoice_orientation' => ['portrait', 'landscape'],
        'invoice_theme' => ['classic', 'modern', 'band', 'boxed', 'stripe', 'compact', 'landscape'],
        'receipt_theme' => ['classic', 'modern', 'band', 'compact'],
        'label_theme' => ['stacked', 'rows', 'classic', 'modern', 'iran', 'stamp'],
        'packing_theme' => ['classic', 'band', 'compact'],
        'label_size' => ['100x150', '100x100', 'A5'],
        'product_label_size' => ['40x30', '50x30', '58x40', '60x40', '80x50', '100x50'],
        'customer_label_size' => ['100x70', '100x100'],
        'store_label_size' => ['100x70', '100x100'],
    ];

    private const STRINGS = [
        'store_name', 'logo_url', 'accent_color', 'footer_thanks', 'footer_site',
        'sender_name', 'sender_address', 'sender_postcode', 'sender_phone', 'sender_email',
        'label_postman_title', 'label_postman_hint',
        'invoice_logo_url', 'receipt_logo_url', 'label_logo_url',
        'invoice_thanks', 'receipt_thanks', 'label_note',
    ];

    private const URLS = ['logo_url', 'invoice_logo_url', 'receipt_logo_url', 'label_logo_url'];

    private const INTS = ['logo_id', 'invoice_logo_id', 'receipt_logo_id', 'label_logo_id'];

    private const BOOLS = [
        'enable_invoice', 'enable_receipt', 'enable_label', 'enable_product_label', 'enable_packing',
        'enable_customer_label', 'enable_store_label',
        'invoice_show_status', 'invoice_show_barcode', 'invoice_show_product_image', 'invoice_show_sku',
        'receipt_show_barcode', 'receipt_show_items_table',
        'label_show_barcode', 'label_show_postman_placeholder', 'product_label_split_variations',
    ];

    /** Pre-port keys of the old five-field invoice form. */
    private const LEGACY = [
        'company_name' => 'sender_name',
        'address' => 'sender_address',
        'phone' => 'sender_phone',
        'footer_note' => 'invoice_thanks',
    ];

    /** @return array<string, mixed> */
    public static function defaults(int $tenantId, ?string $locale = null): array
    {
        $tenant = Tenant::query()->find($tenantId);
        $site = (string) ($tenant?->store_display_name ?: $tenant?->name ?: '');
        $thanks = self::text('thanks', $locale);

        return [
            'store_name' => $site,
            'logo_url' => '',
            'logo_id' => null,
            'accent_color' => '#e775ae',
            'footer_thanks' => $thanks,
            'footer_site' => (string) ($tenant?->domain ?? ''),
            'sender_name' => $site,
            'sender_address' => '',
            'sender_postcode' => '',
            'sender_phone' => '',
            'sender_email' => '',
            'enable_invoice' => true,
            'enable_receipt' => true,
            'enable_label' => true,
            'enable_product_label' => true,
            'enable_packing' => true,
            'enable_customer_label' => true,
            'enable_store_label' => true,
            'invoice_logo_url' => '',
            'receipt_logo_url' => '',
            'label_logo_url' => '',
            'invoice_logo_id' => null,
            'receipt_logo_id' => null,
            'label_logo_id' => null,
            'invoice_thanks' => $thanks,
            'receipt_thanks' => $thanks,
            'label_note' => self::text('label_note', $locale),
            'invoice_parties_order' => 'sender_first',
            'label_parties_order' => 'sender_first',
            'label_orientation' => 'landscape',
            'invoice_orientation' => 'portrait',
            'invoice_theme' => 'classic',
            'receipt_theme' => 'classic',
            'label_theme' => 'stacked',
            'packing_theme' => 'classic',
            'label_size' => 'A5',
            'customer_label_size' => '100x70',
            'store_label_size' => '100x70',
            'product_label_size' => '58x40',
            'product_label_split_variations' => true,
            'invoice_show_status' => true,
            'invoice_show_barcode' => true,
            'invoice_show_product_image' => true,
            'invoice_show_sku' => true,
            'receipt_show_barcode' => true,
            'receipt_show_items_table' => true,
            'label_show_barcode' => true,
            'label_show_products' => false,
            'label_show_postman_placeholder' => true,
            'label_postman_title' => self::text('postman_title', $locale),
            'label_postman_hint' => self::text('postman_hint', $locale),
        ];
    }

    /** @return array<string, mixed> */
    public static function get(int $tenantId, ?string $locale = null): array
    {
        $stored = app(ModuleSettingsService::class)->get($tenantId, self::MODULE, self::KEY);
        $stored = self::migrateLegacy($stored);
        $merged = array_merge(self::defaults($tenantId, $locale), array_intersect_key($stored, self::defaults($tenantId, $locale)));

        $legacyLogo = (string) ($stored['logo_url'] ?? '');
        if ($legacyLogo !== '') {
            foreach (['invoice_logo_url', 'receipt_logo_url', 'label_logo_url'] as $k) {
                if (empty($stored[$k])) {
                    $merged[$k] = $legacyLogo;
                }
            }
        }
        if (isset($stored['footer_thanks']) && ! isset($stored['invoice_thanks'])) {
            $merged['invoice_thanks'] = (string) $stored['footer_thanks'];
            $merged['receipt_thanks'] = (string) $stored['footer_thanks'];
        }

        return $merged;
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function save(int $tenantId, array $input, ?string $locale = null): array
    {
        $current = app(ModuleSettingsService::class)->get($tenantId, self::MODULE, self::KEY);
        $current = array_intersect_key(self::migrateLegacy($current), self::defaults($tenantId, $locale));
        $clean = self::sanitize($tenantId, array_merge($current, $input), $locale);
        app(ModuleSettingsService::class)->put($tenantId, self::MODULE, self::KEY, $clean);

        return self::get($tenantId, $locale);
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function sanitize(int $tenantId, array $input, ?string $locale = null): array
    {
        $defaults = self::defaults($tenantId, $locale);
        $input = self::migrateLegacy($input);
        $out = [];

        foreach (self::STRINGS as $key) {
            if (! array_key_exists($key, $input) || is_array($input[$key])) {
                continue;
            }
            $val = strip_tags((string) $input[$key]);
            $out[$key] = $key === 'sender_address'
                ? trim(preg_replace('/[^\S\n]+/u', ' ', $val) ?? '')
                : trim(preg_replace('/\s+/u', ' ', $val) ?? '');
        }
        foreach (self::URLS as $key) {
            if (isset($out[$key]) && $out[$key] !== '' && ! self::validUrl($out[$key])) {
                $out[$key] = '';
            }
        }
        if (isset($out['accent_color']) && ! preg_match('/^#[0-9a-fA-F]{3,8}$/', $out['accent_color'])) {
            $out['accent_color'] = $defaults['accent_color'];
        }
        foreach (self::ENUMS as $key => $allowed) {
            if (array_key_exists($key, $input)) {
                $val = is_scalar($input[$key]) ? trim((string) $input[$key]) : '';
                $out[$key] = in_array($val, $allowed, true) ? $val : $defaults[$key];
            }
        }
        foreach (self::BOOLS as $key) {
            if (array_key_exists($key, $input)) {
                $out[$key] = filter_var($input[$key], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? false;
            }
        }
        foreach (self::INTS as $key) {
            if (! array_key_exists($key, $input)) {
                continue;
            }
            $raw = $input[$key];
            if ($raw === null || $raw === '' || $raw === false) {
                $out[$key] = null;
                continue;
            }
            $n = (int) $raw;
            $out[$key] = $n > 0 ? $n : null;
        }
        $out['label_show_products'] = false;

        return array_merge($defaults, $out);
    }

    public static function isEnabled(array $settings, string $type): bool
    {
        return in_array($type, self::TYPES, true) && ! empty($settings['enable_'.$type]);
    }

    /** @param  array<string, mixed>  $s */
    public static function logoUrl(string $kind, array $s): string
    {
        $url = (string) ($s[$kind.'_logo_url'] ?? '');

        return $url !== '' ? $url : (string) ($s['logo_url'] ?? '');
    }

    public static function locale(?string $locale): string
    {
        return str_starts_with(strtolower((string) $locale), 'en') ? 'en' : 'fa';
    }

    /**
     * @param  array<string, mixed>  $stored
     * @return array<string, mixed>
     */
    private static function migrateLegacy(array $stored): array
    {
        foreach (self::LEGACY as $old => $new) {
            if (array_key_exists($old, $stored) && ! array_key_exists($new, $stored) && is_scalar($stored[$old]) && (string) $stored[$old] !== '') {
                $stored[$new] = (string) $stored[$old];
            }
            unset($stored[$old]);
        }
        if (array_key_exists('show_logo', $stored)) {
            if (! filter_var($stored['show_logo'], FILTER_VALIDATE_BOOLEAN)) {
                foreach (['logo_url', 'invoice_logo_url', 'receipt_logo_url', 'label_logo_url'] as $k) {
                    $stored[$k] = '';
                }
            }
            unset($stored['show_logo']);
        }

        return $stored;
    }

    private static function validUrl(string $url): bool
    {
        return (bool) filter_var($url, FILTER_VALIDATE_URL) && preg_match('#^https?://#i', $url);
    }

    private static function text(string $key, ?string $locale): string
    {
        return (string) __('order_documents.'.$key, [], self::locale($locale));
    }
}
