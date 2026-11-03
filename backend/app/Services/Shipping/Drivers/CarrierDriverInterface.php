<?php

namespace App\Services\Shipping\Drivers;

interface CarrierDriverInterface
{
    public function code(): string;

    /** live | scaffold */
    public function status(): string;

    /**
     * @param  array<string, mixed>  $config
     * @param  array<string, mixed>  $context  city, state_code, weight_g, cart_subtotal, …
     * @return array{ok: bool, cost_minor: int|null, message?: string, meta?: array<string, mixed>}
     */
    public function quote(array $config, array $context): array;

    /**
     * @param  array<string, mixed>  $config
     * @return array{carrier: string, status: string|null, events: list<array<string, mixed>>, tracking_url: string|null}
     */
    public function track(array $config, string $trackingCode, array $meta = []): array;

    /**
     * @param  array<string, mixed>  $config
     * @return array{ok: bool, message: string}
     */
    public function testConnection(array $config): array;
}
