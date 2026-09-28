<?php

namespace App\Services\Orders;

use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

/**
 * Printable HTML order documents: invoice, receipt, postal label, packing slip, customer/store
 * stickers and warehouse product labels.
 */
final class OrderDocumentRenderer
{
    public const ORDER_TYPES = ['invoice', 'receipt', 'label', 'packing', 'customer_label', 'store_label'];

    private const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

    private const STATES = [
        'ABZ' => ['البرز', 'Alborz'], 'ADL' => ['اردبیل', 'Ardabil'], 'EAZ' => ['آذربایجان شرقی', 'East Azerbaijan'],
        'WAZ' => ['آذربایجان غربی', 'West Azerbaijan'], 'BHR' => ['بوشهر', 'Bushehr'], 'CHB' => ['چهارمحال و بختیاری', 'Chaharmahal and Bakhtiari'],
        'FRS' => ['فارس', 'Fars'], 'GIL' => ['گیلان', 'Gilan'], 'GLS' => ['گلستان', 'Golestan'], 'HDN' => ['همدان', 'Hamadan'],
        'HRZ' => ['هرمزگان', 'Hormozgan'], 'ILM' => ['ایلام', 'Ilam'], 'ESF' => ['اصفهان', 'Isfahan'], 'KRN' => ['کرمان', 'Kerman'],
        'KRH' => ['کرمانشاه', 'Kermanshah'], 'NKH' => ['خراسان شمالی', 'North Khorasan'], 'RKH' => ['خراسان رضوی', 'Razavi Khorasan'],
        'SKH' => ['خراسان جنوبی', 'South Khorasan'], 'KHZ' => ['خوزستان', 'Khuzestan'], 'KBD' => ['کهگیلویه و بویراحمد', 'Kohgiluyeh and Boyer-Ahmad'],
        'KRD' => ['کردستان', 'Kurdistan'], 'LRS' => ['لرستان', 'Lorestan'], 'MKZ' => ['مرکزی', 'Markazi'], 'MZN' => ['مازندران', 'Mazandaran'],
        'GZN' => ['قزوین', 'Qazvin'], 'QHM' => ['قم', 'Qom'], 'SMN' => ['سمنان', 'Semnan'], 'SBN' => ['سیستان و بلوچستان', 'Sistan and Baluchestan'],
        'THR' => ['تهران', 'Tehran'], 'YZD' => ['یزد', 'Yazd'], 'ZJN' => ['زنجان', 'Zanjan'],
    ];

    private string $locale = 'fa';

    /** @var array<string, mixed> */
    private array $s = [];

    public function __construct(private readonly int $tenantId, ?string $locale = null, private readonly string $assetBase = '')
    {
        $this->locale = OrderDocumentSettings::locale($locale);
        $this->s = OrderDocumentSettings::get($tenantId, $this->locale);
    }

    /** @return array<string, mixed> */
    public function settings(): array
    {
        return $this->s;
    }

    public function enabled(string $type): bool
    {
        return OrderDocumentSettings::isEnabled($this->s, $type);
    }

    public function render(Order $order, string $type): string
    {
        $order->loadMissing(['items.product', 'items.variant', 'user']);

        return match ($type) {
            'receipt' => $this->view('receipt', $this->orderData($order)),
            'label' => $this->view('labels', ['orders' => [$this->orderData($order)], 'title' => __('order_documents.label_title', ['number' => $this->n($this->number($order))], $this->locale)]),
            'packing' => $this->view('packing', $this->orderData($order)),
            'customer_label', 'store_label' => $this->view('sticker', $this->orderData($order) + ['kind' => $type === 'store_label' ? 'store' : 'customer']),
            default => $this->view('invoice', $this->orderData($order)),
        };
    }

    /** @param  iterable<Order>  $orders */
    public function renderLabels(iterable $orders): string
    {
        $rows = [];
        foreach ($orders as $order) {
            $order->loadMissing(['items', 'user']);
            $rows[] = $this->orderData($order);
        }

        return $this->view('labels', ['orders' => $rows, 'title' => __('order_documents.labels_title', [], $this->locale)]);
    }

    /** @param  Collection<int, Product>  $products */
    public function renderProductLabels(Collection $products): string
    {
        $split = ! empty($this->s['product_label_split_variations']);
        $rows = [];
        foreach ($products as $p) {
            $variants = $split ? $p->variants : collect();
            if ($variants->isEmpty()) {
                $rows[] = $this->labelRow($p);

                continue;
            }
            foreach ($variants as $v) {
                $rows[] = $this->labelRow($p, $v);
            }
        }

        return $this->view('product-labels', ['rows' => $rows]);
    }

    /** Locale-aware digits for display text. */
    public function n(string|int|float|null $value): string
    {
        $value = (string) $value;

        return $this->locale === 'fa' ? str_replace(range(0, 9), self::FA_DIGITS, $value) : $value;
    }

    public function price(int|float|null $minor, ?string $currency): string
    {
        $currency = strtoupper((string) ($currency ?: 'IRR'));
        $sep = $this->locale === 'fa' ? '٬' : ',';
        $amount = $this->n(number_format((float) ($minor ?? 0), 0, '.', $sep));
        $label = __('order_documents.currencies.'.$currency, [], $this->locale);
        if (str_starts_with($label, 'order_documents.')) {
            $label = $currency;
        }

        return $amount.' '.$label;
    }

    public function t(string $key, array $replace = []): string
    {
        return (string) __('order_documents.'.$key, $replace, $this->locale);
    }

    /** @param  array<string, string>  $p */
    public function addressSummary(array $p): string
    {
        $sep = $this->locale === 'fa' ? '، ' : ', ';

        return implode($sep, array_filter([$p['state_label'] ?? '', $p['city'] ?? '', $p['address'] ?? ''], fn ($v) => $v !== ''));
    }

    /** @return list<string> Postcode digits padded to 10 boxes. */
    public function postcodeBoxes(string $code): array
    {
        $digits = str_pad(substr((string) preg_replace('/\D+/', '', $code), 0, 10), 10, ' ');

        return array_map(fn ($ch) => $ch === ' ' ? '' : $this->n($ch), str_split($digits));
    }

    public function barcode(string $text): string
    {
        return Code128Barcode::dataUri($text);
    }

    public function logo(string $kind): string
    {
        return OrderDocumentSettings::logoUrl($kind, $this->s);
    }

    public function fontFaceCss(): string
    {
        if ($this->locale !== 'fa' || $this->assetBase === '') {
            return '';
        }
        $base = rtrim($this->assetBase, '/').'/fonts/yekan-bakh/woff2/';
        $css = '';
        foreach ([400 => 'Regular', 600 => 'SemiBold', 700 => 'Bold'] as $weight => $file) {
            $css .= "@font-face { font-family: yekanbakh; font-style: normal; font-weight: {$weight}; src: url('{$base}YekanBakh-{$file}.woff2') format('woff2'); }\n";
        }

        return $css;
    }

    /** @param  array<string, mixed>  $data */
    private function view(string $name, array $data): string
    {
        $config = [
            'lang' => $this->locale,
            'dir' => $this->locale === 'fa' ? 'rtl' : 'ltr',
            'font' => $this->locale === 'fa' ? 'yekanbakh, Tahoma, sans-serif' : 'system-ui, -apple-system, Segoe UI, sans-serif',
        ];

        return view('order-documents.'.$name, $data + ['doc' => $this, 's' => $this->s, 'config' => $config])->render();
    }

    /** @return array<string, mixed> */
    private function orderData(Order $order): array
    {
        $number = $this->number($order);
        $meta = is_array($order->meta) ? $order->meta : [];
        $items = [];
        $row = 0;
        foreach ($order->items as $item) {
            $row++;
            $qty = (int) $item->quantity;
            $sku = (string) ($item->sku ?: ($item->variant?->sku ?: $item->product?->sku ?: ''));
            $items[] = [
                'row' => $row,
                'name' => (string) ($item->product_name ?: ($item->product?->name ?? '')),
                'sku' => $sku,
                'qty' => $qty,
                'unit' => (int) $item->unit_price_minor,
                'total' => (int) $item->unit_price_minor * $qty,
                'image' => (string) ($item->variant?->image_url ?? '') ?: (string) ($item->product?->image_url ?? ''),
            ];
        }
        $status = (string) $order->status;
        $statusLabel = $this->t('statuses.'.$status);
        $provider = (string) ($order->payment_provider ?: $order->payment_tender ?: '');
        $payment = $provider === '' ? '' : $this->t('gateways.'.$provider);

        return [
            'order' => $order,
            'number' => $number,
            'numDisp' => $this->n($number),
            'date' => $this->formatDate($order->created_at, true),
            'dateShort' => $this->formatDate($order->created_at, false),
            'ship' => $this->addressParts($order),
            'method' => (string) ($meta['shipping_title'] ?? ''),
            'payment' => str_starts_with($payment, 'order_documents.') ? $provider : $payment,
            'statusLabel' => str_starts_with($statusLabel, 'order_documents.') ? $status : $statusLabel,
            'items' => $items,
            'currency' => (string) ($order->currency ?: 'IRR'),
            'subtotal' => (int) ($order->subtotal_minor ?: array_sum(array_column($items, 'total'))),
            'discount' => (int) $order->discount_minor,
            'shipping' => (int) $order->shipping_minor,
            'total' => (int) $order->total_minor,
            'note' => (string) ($order->customer_note ?? ''),
        ];
    }

    private function number(Order $order): string
    {
        return (string) ($order->number ?: $order->id);
    }

    /** @return array{name: string, state_label: string, city: string, postcode: string, address: string, phone: string, email: string} */
    private function addressParts(Order $order): array
    {
        $raw = $order->getRawOriginal('shipping_address') ?? $order->shipping_address;
        $data = is_array($raw) ? $raw : (is_string($raw) ? json_decode($raw, true) : null);
        if (! is_array($data)) {
            $data = [];
            $text = is_string($raw) ? trim($raw) : '';
            if ($text !== '') {
                $data['address'] = $text;
            }
        }
        if ($data === [] && is_array($order->billing_address)) {
            $data = $order->billing_address;
        }
        $str = fn (string $k) => is_scalar($data[$k] ?? null) ? trim((string) $data[$k]) : '';

        $name = trim($str('first_name').' '.$str('last_name')) ?: $str('name');
        $name = $name ?: (string) ($order->customer_name ?: ($order->user?->name ?? ''));
        $address = trim($str('address').' '.$str('address_1').' '.$str('address_2'));
        $state = $str('state');
        $label = self::STATES[strtoupper($state)][$this->locale === 'fa' ? 0 : 1] ?? $state;

        return [
            'name' => $name,
            'state_label' => $label,
            'city' => $str('city'),
            'postcode' => $str('postcode'),
            'address' => $address,
            'phone' => $str('phone') ?: (string) ($order->customer_phone ?? ''),
            'email' => $str('email') ?: (string) ($order->customer_email ?: ($order->user?->email ?? '')),
        ];
    }

    private function formatDate(?CarbonInterface $at, bool $withTime): string
    {
        if (! $at) {
            return '';
        }
        $at = $at->copy()->setTimezone(config('app.timezone') === 'UTC' ? 'Asia/Tehran' : config('app.timezone'));
        if ($this->locale !== 'fa') {
            return $at->format($withTime ? 'Y-m-d H:i' : 'Y-m-d');
        }
        [$y, $m, $d] = self::toJalali((int) $at->format('Y'), (int) $at->format('n'), (int) $at->format('j'));
        $out = sprintf('%04d/%02d/%02d', $y, $m, $d);
        if ($withTime) {
            $out .= ' '.$at->format('H:i');
        }

        return $this->n($out);
    }

    /** @return array{0: int, 1: int, 2: int} */
    public static function toJalali(int $gy, int $gm, int $gd): array
    {
        $gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
        $gy2 = $gm > 2 ? $gy + 1 : $gy;
        $days = 355666 + (365 * $gy) + intdiv($gy2 + 3, 4) - intdiv($gy2 + 99, 100) + intdiv($gy2 + 399, 400) + $gd + $gdm[$gm - 1];
        $jy = -1595 + (33 * intdiv($days, 12053));
        $days %= 12053;
        $jy += 4 * intdiv($days, 1461);
        $days %= 1461;
        if ($days > 365) {
            $jy += intdiv($days - 1, 365);
            $days = ($days - 1) % 365;
        }
        if ($days < 186) {
            $jm = 1 + intdiv($days, 31);
            $jd = 1 + ($days % 31);
        } else {
            $jm = 7 + intdiv($days - 186, 30);
            $jd = 1 + (($days - 186) % 30);
        }

        return [$jy, $jm, $jd];
    }

    /** @return array{name: string, sku: string, code: string, price: string} */
    private function labelRow(Product $p, ?ProductVariant $v = null): array
    {
        $name = $v ? trim($p->name.' - '.($v->name ?: '')) : (string) $p->name;
        $sku = (string) ($v?->sku ?: ($v ? '' : $p->sku) ?: '');
        $price = $p->effectivePriceMinor($v);

        return [
            'name' => rtrim($name, ' -'),
            'sku' => $sku,
            'code' => $sku !== '' ? $sku : (string) ($v?->id ?? $p->id),
            'price' => $price > 0 ? $this->price($price, $p->currency) : '',
        ];
    }
}
