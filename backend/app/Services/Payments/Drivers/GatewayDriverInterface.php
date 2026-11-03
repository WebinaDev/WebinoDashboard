<?php

namespace App\Services\Payments\Drivers;

/**
 * Site-commerce payment driver contract.
 * Live drivers implement request/verify; scaffolds throw NotImplemented until wired.
 */
interface GatewayDriverInterface
{
    public function code(): string;

    public function status(): string;

    /**
     * @param  array<string, mixed>  $config
     * @return array{ok: bool, message: string, redirect_url?: string, authority?: string, meta?: array<string, mixed>}
     */
    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array;

    /**
     * @param  array<string, mixed>  $config
     * @param  array<string, mixed>  $callback
     * @return array{ok: bool, message: string, ref_id?: string, meta?: array<string, mixed>}
     */
    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array;

    /**
     * @param  array<string, mixed>  $config
     * @return array{ok: bool, message: string}
     */
    public function testConnection(array $config): array;
}
