<?php

namespace App\Services\Payments;

use App\Support\Currency;
use App\Models\Order;
use App\Models\PaymentIntent;
use App\Models\Tenant;
use App\Services\Marketplace\Basalam\BasalamPay;
use App\Services\Payments\Drivers\GatewayDriverRegistry;
use App\Services\Pricing\PurchaseTypeService;
use Illuminate\Support\Facades\Http;

/**
 * Checkout intents driven by tenant gateway settings + official provider APIs.
 */
class PaymentCheckoutService
{
    /** @var array<string, mixed> */
    protected array $intentExtra = [];

    public function __construct(
        protected PaymentGatewaySettingsService $gateways,
        protected DigipayClient $digipay,
        protected BnplClient $bnpl,
        protected GatewayDriverRegistry $drivers,
    ) {}

    public function createIntent(Order $order, string $provider, ?string $mode = null): PaymentIntent
    {
        $provider = str_replace('-', '_', strtolower($provider));
        $allowed = array_values(array_unique(array_merge(
            $this->gateways->liveCommerceGatewayIds(),
            ['bale_pay', BasalamPay::PROVIDER],
        )));
        if ($this->gateways->catalog()->isScaffold($provider)) {
            throw new \DomainException('این درگاه به‌زودی فعال می‌شود.');
        }
        if (! in_array($provider, $allowed, true)) {
            throw new \InvalidArgumentException('Unsupported payment provider: '.$provider);
        }

        $tid = (int) $order->tenant_id;
        if (! $this->gateways->isEnabled($tid, $provider)) {
            throw new \RuntimeException('Payment gateway is disabled.');
        }
        // Never send a customer to pay for items that are no longer held for them.
        app(\App\Services\Orders\OrderStock::class)->ensureHoldForPayment($order);
        $purchaseType = (string) ($order->meta['wfcp_purchase_type'] ?? '');
        if ($purchaseType !== '' && ! PurchaseTypeService::forTenant($tid)->gatewayAllowed($purchaseType, $provider)) {
            throw new \DomainException(__('Payment gateway is not allowed for this purchase type.'));
        }
        if ($provider === BasalamPay::PROVIDER) {
            $pay = BasalamPay::for($tid);
            if (! $pay->configured()) {
                throw new \RuntimeException('Payment gateway is not configured.');
            }

            return $pay->createIntent($order);
        }
        if (! $this->gateways->configured($tid, $provider)) {
            throw new \RuntimeException('Payment gateway is not configured.');
        }

        $settings = $this->gateways->getRaw($tid, $provider);
        $mode = $this->resolveMode($order, $mode, $settings, $provider);
        $state = \Illuminate\Support\Str::random(40);
        $callbackUrl = url('/api/v1/payments/callback/'.$provider.'/'.$order->id).'?nonce='.$state;
        $quote = $this->gateways->feeQuote($settings, (int) $order->total_minor);
        $amountRial = $this->amountInRials($order, (int) $quote['charge_minor']);
        $this->intentExtra = [
            'state' => $state,
            'mode' => $mode,
            'fee_percent' => $quote['fee_percent'],
            'fee_payer' => $quote['fee_payer'],
            'fee_minor' => $quote['fee_minor'],
            'base_minor' => $quote['base_minor'],
            'charge_minor' => $quote['charge_minor'],
            'amount_rial' => $amountRial,
        ];

        $driver = $this->drivers->get($provider);
        if ($driver && $driver->status() === 'live') {
            return $this->createDriverIntent($order, $settings, $callbackUrl, $amountRial, $provider, $driver);
        }

        return match ($provider) {
            'digipay' => $this->createDigipayIntent($order, $settings, $callbackUrl, $amountRial),
            'snapppay' => $this->createBnplIntent($order, $settings, $callbackUrl, $amountRial, 'snapppay'),
            'torobpay' => $this->createBnplIntent($order, $settings, $callbackUrl, $amountRial, 'torobpay'),
            'bale_pay' => $this->createBalePayIntent($order, $settings, $callbackUrl, $amountRial),
            default => throw new \InvalidArgumentException('Unsupported provider'),
        };
    }

    /**
     * @param  array<string, mixed>  $settings
     */
    protected function createDriverIntent(
        Order $order,
        array $settings,
        string $callbackUrl,
        int $amountRial,
        string $provider,
        \App\Services\Payments\Drivers\GatewayDriverInterface $driver,
    ): PaymentIntent {
        $description = str_replace(
            '{order_id}',
            (string) $order->id,
            (string) ($settings['payment_description'] ?? 'Order #'.$order->id)
        );
        $result = $driver->request($settings, $amountRial, $callbackUrl, $description, [
            'order_id' => (string) $order->id,
            'mobile' => $order->customer_phone ?: null,
            'email' => $order->customer_email ?: null,
            'name' => $order->customer_name ?: null,
            'currency' => $this->storeCurrencyCode($order),
        ]);
        if (! ($result['ok'] ?? false) || empty($result['redirect_url'])) {
            throw new \RuntimeException((string) ($result['message'] ?? 'Gateway request failed'));
        }

        $intent = PaymentIntent::query()->create([
            'tenant_id' => $order->tenant_id,
            'order_id' => $order->id,
            'provider' => $provider,
            'status' => 'created',
            'redirect_url' => (string) $result['redirect_url'],
            'meta' => $this->withExtra(array_merge(
                ['stub' => false, 'amount_rial' => $amountRial],
                is_array($result['meta'] ?? null) ? $result['meta'] : [],
            )),
        ]);

        $order->update([
            'payment_provider' => $provider,
            'payment_url' => (string) $result['redirect_url'],
            'status' => 'awaiting_gateway',
        ]);

        return $intent;
    }

    /**
     * Bale Pay: pending intent + deep-link through the tenant Bale bot when configured.
     *
     * @param  array<string, mixed>  $settings
     */
    protected function createBalePayIntent(Order $order, array $settings, string $callbackUrl, int $amountRial): PaymentIntent
    {
        $bot = \App\Models\BotSetting::query()
            ->where('tenant_id', $order->tenant_id)
            ->where('provider', 'bale')
            ->where('enabled', true)
            ->first();
        $username = (string) (($bot?->meta ?? [])['username'] ?? '');
        $payUrl = $username !== ''
            ? 'https://ble.ir/'.$username.'?start=pay_'.$order->id
            : $callbackUrl;

        $intent = PaymentIntent::query()->create([
            'tenant_id' => $order->tenant_id,
            'order_id' => $order->id,
            'provider' => 'bale_pay',
            'status' => 'pending',
            'redirect_url' => $payUrl,
            'meta' => $this->withExtra([
                'callback_url' => $callbackUrl,
                'title' => (string) ($settings['title'] ?? 'بله پی'),
                'amount_rial' => $amountRial,
                'provider_ref' => 'bale-'.$order->id.'-'.uniqid(),
            ]),
        ]);

        $order->update([
            'payment_provider' => 'bale_pay',
            'payment_url' => $payUrl,
            'status' => 'awaiting_gateway',
        ]);

        return $intent;
    }

    /**
     * @param  array<string, mixed>  $settings
     */
    protected function createDigipayIntent(Order $order, array $settings, string $callbackUrl, int $amountRial): PaymentIntent
    {
        $token = $this->digipay->bearerToken($settings);
        if ($token === null) {
            throw new \RuntimeException('Digipay OAuth failed — check credentials.');
        }

        $base = $this->digipay->baseUrl($settings);
        $cell = preg_replace('/\D+/', '', (string) ($order->customer_phone ?? '')) ?: '';
        if ($cell === '') {
            throw new \RuntimeException('Digipay requires customer phone (cellNumber).');
        }
        if (str_starts_with($cell, '98') && strlen($cell) === 12) {
            $cell = '0'.substr($cell, 2);
        }

        $providerId = (string) $order->id;
        $mode = (string) ($this->intentExtra['mode'] ?? 'cash');
        $pref = $mode === 'installment'
            ? (int) ($settings['preferred_gateway_installment'] ?? 5)
            : (int) ($settings['preferred_gateway'] ?? 2);
        $body = [
            'cellNumber' => $cell,
            'amount' => $amountRial,
            'providerId' => $providerId,
            'callbackUrl' => $callbackUrl,
            'additionalInfo' => [
                'preferredGateway' => $pref,
            ],
        ];

        $response = Http::timeout(30)
            ->withHeaders([
                'Agent' => 'WEB',
                'Digipay-Version' => $this->digipay->version($settings),
                'Authorization' => 'Bearer '.$token,
                'Content-Type' => 'application/json',
            ])
            ->post($base.'/tickets/business?type=11', $body)
            ->json();

        if ((int) data_get($response, 'result.status') !== 0) {
            throw new \RuntimeException(
                'Digipay ticket failed: '.(string) data_get($response, 'result.message', json_encode($response))
            );
        }

        $redirectUrl = data_get($response, 'redirectUrl');
        if (! is_string($redirectUrl) || $redirectUrl === '') {
            throw new \RuntimeException('Digipay response missing redirectUrl.');
        }

        return PaymentIntent::query()->create([
            'tenant_id' => $order->tenant_id,
            'order_id' => $order->id,
            'provider' => 'digipay',
            'status' => 'created',
            'redirect_url' => $redirectUrl,
            'meta' => $this->withExtra([
                'stub' => false,
                'digipay_ticket' => data_get($response, 'ticket'),
                'provider_id' => $providerId,
                'amount_rial' => $amountRial,
            ]),
        ]);
    }

    /**
     * @param  array<string, mixed>  $settings
     */
    protected function createBnplIntent(
        Order $order,
        array $settings,
        string $callbackUrl,
        int $amountRial,
        string $provider,
    ): PaymentIntent {
        $cart = $this->cartList($order->loadMissing('items'), $amountRial);
        $body = [
            'amount' => $amountRial,
            'cartList' => $cart,
            'paymentMethodTypeDto' => 'ONLINE_CREDIT',
            'returnURL' => $callbackUrl,
            'transactionId' => (string) $order->id,
            'mobile' => $order->customer_phone ?: null,
        ];
        if (! empty($settings['mobile_enabled']) && empty($body['mobile'])) {
            throw new \RuntimeException(ucfirst($provider).' requires customer mobile.');
        }

        $result = $this->bnpl->post($settings, $provider, 'api/online/payment/v1/token', array_filter($body));
        if (! $result['ok']) {
            throw new \RuntimeException(ucfirst($provider).' token failed: '.($result['message'] ?: json_encode($result['data'])));
        }

        $paymentToken = (string) (data_get($result['data'], 'response.paymentToken')
            ?? data_get($result['data'], 'paymentToken')
            ?? '');
        $pageUrl = (string) (data_get($result['data'], 'response.paymentPageUrl')
            ?? data_get($result['data'], 'paymentPageUrl')
            ?? '');
        if ($paymentToken === '' || $pageUrl === '') {
            throw new \RuntimeException(ucfirst($provider).' response missing paymentToken/pageUrl.');
        }

        return PaymentIntent::query()->create([
            'tenant_id' => $order->tenant_id,
            'order_id' => $order->id,
            'provider' => $provider,
            'status' => 'created',
            'redirect_url' => $pageUrl,
            'meta' => $this->withExtra([
                'stub' => false,
                'payment_token' => $paymentToken,
                'amount_rial' => $amountRial,
            ]),
        ]);
    }

    /**
     * @param  array<string, mixed>  $meta
     * @return array<string, mixed>
     */
    protected function withExtra(array $meta): array
    {
        return array_merge($this->intentExtra, $meta);
    }

    /**
     * @param  array<string, mixed>  $settings
     */
    protected function resolveMode(Order $order, ?string $mode, array $settings, string $provider): string
    {
        if ($mode === null || $mode === '') {
            $purchase = (string) ($order->meta['wfcp_purchase_type'] ?? '');
            $mode = $purchase === 'installment' ? 'installment' : 'cash';
        }
        if (! in_array($mode, ['cash', 'installment'], true)) {
            throw new \InvalidArgumentException('Unsupported payment mode.');
        }
        if (in_array($provider, $this->gateways->liveCommerceGatewayIds(), true)
            && ! $this->gateways->supportsMode($settings, $mode)) {
            throw new \DomainException('Payment gateway does not support this mode.');
        }

        return $mode;
    }

    protected function amountInRials(Order $order, ?int $chargeMinor = null): int
    {
        $minor = $chargeMinor ?? (int) $order->total_minor;
        $currency = $this->storeCurrencyCode($order);
        // Store amounts are in minor units of the store display currency.
        // Iranian PSPs settle in IRR (rial) — never send display toman/hezar as rial.
        try {
            return max(1, Currency::toGatewayRial($minor, $currency));
        } catch (\InvalidArgumentException) {
            // Foreign display without FX: refuse silent wrong units; treat as IRT.
            return max(1, Currency::toGatewayRial($minor, 'IRT'));
        }
    }

    protected function storeCurrencyCode(Order $order): string
    {
        $code = Currency::normalize((string) ($order->currency ?: ''), 'IRT');
        if (in_array($code, Currency::DISPLAY_CODES, true)) {
            return $code;
        }
        $tenant = Tenant::query()->find($order->tenant_id);
        $fromTenant = Currency::normalize((string) ($tenant?->default_currency ?? 'IRT'), 'IRT');

        return in_array($fromTenant, Currency::DISPLAY_CODES, true) ? $fromTenant : 'IRT';
    }

    /**
     * @return list<array<string, mixed>>
     */
    protected function cartList(Order $order, int $amountRial): array
    {
        $items = [];
        foreach ($order->items ?? [] as $line) {
            $qty = max(1, (int) ($line->quantity ?? 1));
            $unit = (int) ($line->unit_price_minor ?? 0);
            $currency = $this->storeCurrencyCode($order);
            try {
                $unitRial = Currency::toGatewayRial($unit, $currency);
            } catch (\InvalidArgumentException) {
                $unitRial = Currency::toGatewayRial($unit, 'IRT');
            }
            $items[] = [
                'count' => $qty,
                'amount' => max(1, $unitRial),
                'category' => 'GENERAL',
                'id' => (string) ($line->product_id ?? $line->id ?? 'item'),
                'name' => (string) ($line->product_name ?? 'Item'),
            ];
        }
        if ($items === []) {
            $items[] = [
                'count' => 1,
                'amount' => $amountRial,
                'category' => 'GENERAL',
                'id' => (string) $order->id,
                'name' => 'Order #'.$order->id,
            ];
        }

        return $items;
    }
}
