<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\PaymentGatewayCatalog;

class GatewayDriverRegistry
{
    /** @var array<string, GatewayDriverInterface> */
    private array $drivers = [];

    public function __construct(protected PaymentGatewayCatalog $catalog)
    {
        foreach ($this->liveDrivers() as $driver) {
            $this->drivers[$driver->code()] = $driver;
        }
        foreach ($this->catalog->all() as $id => $meta) {
            if (isset($this->drivers[$id])) {
                continue;
            }
            if (($meta['status'] ?? '') === 'scaffold') {
                $this->drivers[$id] = new ScaffoldGatewayDriver(
                    $id,
                    is_array($meta['required'] ?? null) ? $meta['required'] : [],
                    is_string($meta['docs_url'] ?? null) ? $meta['docs_url'] : null,
                );
            }
        }
    }

    /** @return list<GatewayDriverInterface> */
    protected function liveDrivers(): array
    {
        return [
            new ZarinpalDriver,
            new ZibalDriver,
            new IdpayDriver,
            new NextpayDriver,
            new PaypingDriver,
            new PayirDriver,
            new VandarDriver,
            new AghayepardakhtDriver,
            new BitpayDriver,
            new SamanDriver,
            new SadadDriver,
            new ParsianDriver,
            new MellatDriver,
            new StripeDriver,
            new PaypalDriver,
            new NowpaymentsDriver,
            new CryptomusDriver,
            new CoingateDriver,
            new ShepaDriver,
            new PaystarDriver,
            new JibitDriver,
            new ParspalDriver,
            new PayfaDriver,
            new EasypayDriver,
            new ZarinplusDriver,
            new TomanDriver,
            new TaraDriver,
            new AsanpardakhtDriver,
            new PasargadDriver,
            new SepehrDriver,
            new SaderatDriver,
            new SamankishDriver,
            new IrankishDriver,
            new OmidpayDriver,
            new IranWalletDriver,
            new PerfectMoneyDriver,
            new PayeerDriver,
            new CoinpaymentsDriver,
            new BinancePayDriver,
            new IrcryptopayDriver,
        ];
    }

    public function get(string $code): ?GatewayDriverInterface
    {
        return $this->drivers[$code] ?? null;
    }

    public function has(string $code): bool
    {
        return isset($this->drivers[$code]);
    }

    /** @return list<string> */
    public function liveCodes(): array
    {
        $out = [];
        foreach ($this->drivers as $code => $driver) {
            if ($driver->status() === 'live') {
                $out[] = $code;
            }
        }

        return $out;
    }
}
