<?php

return [
    'order_status' => [
        'title' => 'سفارش {order_number}',
        'customer' => 'وضعیت سفارش {order_number} به «{status}» تغییر کرد.',
        'admin' => 'وضعیت سفارش {order_number} ({customer_name}) به «{status}» تغییر کرد.',
    ],
    'return_requested' => [
        'title' => 'درخواست مرجوعی سفارش {order_number}',
        'customer' => 'درخواست مرجوعی شما برای سفارش {order_number} ثبت شد.',
        'admin' => 'درخواست مرجوعی جدید برای سفارش {order_number} از {customer_name}.',
    ],
    'return_approved' => [
        'title' => 'تأیید مرجوعی سفارش {order_number}',
        'customer' => 'درخواست مرجوعی سفارش {order_number} تأیید شد.',
        'admin' => 'مرجوعی سفارش {order_number} تأیید شد.',
    ],
    'return_rejected' => [
        'title' => 'رد مرجوعی سفارش {order_number}',
        'customer' => 'درخواست مرجوعی سفارش {order_number} رد شد.',
        'admin' => 'مرجوعی سفارش {order_number} رد شد.',
    ],
    'user_welcome' => [
        'title' => 'به {site_name} خوش آمدید',
        'customer' => '{customer_name} عزیز، به {site_name} خوش آمدید!',
        'admin' => 'کاربر جدید ثبت‌نام کرد: {customer_name}.',
    ],
    'stock_low' => [
        'title' => 'موجودی کم: {product_name}',
        'customer' => 'موجودی {product_name} رو به اتمام است.',
        'admin' => 'موجودی {product_name} کم است ({stock} عدد باقی مانده).',
    ],
    'stock_out' => [
        'title' => 'ناموجود: {product_name}',
        'customer' => '{product_name} ناموجود شد.',
        'admin' => 'موجودی {product_name} به پایان رسید.',
    ],
    'review_pending' => [
        'title' => 'دیدگاه جدید در انتظار تأیید',
        'customer' => 'دیدگاه شما برای {product_name} در انتظار تأیید است.',
        'admin' => 'دیدگاه جدید {customer_name} برای {product_name} در انتظار تأیید است.',
    ],
];
