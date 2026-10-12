<?php

return [
    // Minutes an unpaid order holds its stock before stock:release-reservations gives it back.
    'stock_reservation_minutes' => (int) env('SHOP_STOCK_RESERVATION_MINUTES', 15),
];
