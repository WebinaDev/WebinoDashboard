<?php

return [
    'order_status' => [
        'title' => 'Order {order_number}',
        'customer' => 'Order {order_number} status is now "{status}".',
        'admin' => 'Order {order_number} ({customer_name}) status changed to "{status}".',
    ],
    'return_requested' => [
        'title' => 'Return request for order {order_number}',
        'customer' => 'Your return request for order {order_number} was received.',
        'admin' => 'New return request for order {order_number} from {customer_name}.',
    ],
    'return_approved' => [
        'title' => 'Return approved for order {order_number}',
        'customer' => 'Your return request for order {order_number} was approved.',
        'admin' => 'Return for order {order_number} was approved.',
    ],
    'return_rejected' => [
        'title' => 'Return rejected for order {order_number}',
        'customer' => 'Your return request for order {order_number} was rejected.',
        'admin' => 'Return for order {order_number} was rejected.',
    ],
    'user_welcome' => [
        'title' => 'Welcome to {site_name}',
        'customer' => 'Hi {customer_name}, welcome to {site_name}!',
        'admin' => 'New user registered: {customer_name}.',
    ],
    'stock_low' => [
        'title' => 'Low stock: {product_name}',
        'customer' => '{product_name} is running low.',
        'admin' => '{product_name} is low in stock ({stock} left).',
    ],
    'stock_out' => [
        'title' => 'Out of stock: {product_name}',
        'customer' => '{product_name} is out of stock.',
        'admin' => '{product_name} is out of stock.',
    ],
    'review_pending' => [
        'title' => 'New review awaiting approval',
        'customer' => 'Your review for {product_name} is awaiting approval.',
        'admin' => 'New review for {product_name} by {customer_name} is awaiting approval.',
    ],
];
