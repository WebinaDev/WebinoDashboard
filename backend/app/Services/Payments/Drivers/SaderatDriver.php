<?php

namespace App\Services\Payments\Drivers;

/** Bank Saderat uses Sepehr IPG — same endpoints as SepehrDriver. */
class SaderatDriver extends SepehrDriver
{
    public function code(): string
    {
        return 'saderat';
    }
}
