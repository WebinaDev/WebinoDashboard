<?php

namespace App\Services\Orders;

/** The order's stock hold lapsed and the items are gone, so payment must not start. */
final class StockUnavailableException extends \DomainException {}
