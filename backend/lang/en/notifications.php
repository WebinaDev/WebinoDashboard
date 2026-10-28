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
    'order_refund_required' => [
        'title' => 'Refund needed: order {order_number}',
        'customer' => 'An item in order {order_number} ran out before your payment was confirmed. {amount} will be refunded to you.',
        'admin' => 'Payment for order {order_number} ({customer_name} {customer_phone}) was verified but the stock had run out. Refund {amount} and mark the order refunded.',
    ],
    'review_pending' => [
        'title' => 'New review awaiting approval',
        'customer' => 'Your review for {product_name} is awaiting approval.',
        'admin' => 'New review for {product_name} by {customer_name} is awaiting approval.',
    ],
    'product_back_in_stock' => [
        'title' => 'Back in stock: {product_name}',
        'customer' => '{product_name} is back in stock. {product_url}',
        'admin' => '{product_name} is back in stock. {product_url}',
    ],
    'product_on_sale' => [
        'title' => 'On sale: {product_name}',
        'customer' => '{product_name} is on sale. {product_url}',
        'admin' => '{product_name} is on sale. {product_url}',
    ],
    'product_price_drop' => [
        'title' => 'Price drop: {product_name}',
        'customer' => '{product_name} dropped to {price}. {product_url}',
        'admin' => '{product_name} dropped to {price}. {product_url}',
    ],
];
