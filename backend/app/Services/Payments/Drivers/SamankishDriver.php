<?php

namespace App\Services\Payments\Drivers;

/**
 * Saman Kish / SEP token API (same family as SamanDriver).
 * Catalog keeps a separate id for merchant terminals issued as «سامان کیش».
 */
class SamankishDriver extends SamanDriver
{
    public function code(): string
    {
        return 'samankish';
    }
}
