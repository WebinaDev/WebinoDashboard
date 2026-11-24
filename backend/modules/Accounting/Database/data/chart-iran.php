<?php

/**
 * Default Iranian-style chart of accounts (minimal seed; extend as needed).
 * Each row: code, name, parent_code|null, type, is_postable
 */
return [
    ['code' => '1', 'name' => 'دارایی‌ها', 'parent_code' => null, 'type' => 'asset', 'is_postable' => false],
    ['code' => '2', 'name' => 'بدهی‌ها', 'parent_code' => null, 'type' => 'liability', 'is_postable' => false],
    ['code' => '3', 'name' => 'حقوق صاحبان سهام', 'parent_code' => null, 'type' => 'equity', 'is_postable' => false],
    ['code' => '4', 'name' => 'درآمدها', 'parent_code' => null, 'type' => 'revenue', 'is_postable' => false],
    ['code' => '401', 'name' => 'درآمد فروش کالا و خدمات', 'parent_code' => '4', 'type' => 'revenue', 'is_postable' => true],
    ['code' => '5', 'name' => 'هزینه‌ها', 'parent_code' => null, 'type' => 'expense', 'is_postable' => false],
    ['code' => '11', 'name' => 'دارایی‌های جاری', 'parent_code' => '1', 'type' => 'asset', 'is_postable' => false],
    ['code' => '111', 'name' => 'صندوق', 'parent_code' => '11', 'type' => 'asset', 'is_postable' => true],
    ['code' => '112', 'name' => 'بانک', 'parent_code' => '11', 'type' => 'asset', 'is_postable' => true],
    ['code' => '113', 'name' => 'حساب‌های دریافتنی', 'parent_code' => '11', 'type' => 'asset', 'is_postable' => true],
    ['code' => '21', 'name' => 'بدهی‌های جاری', 'parent_code' => '2', 'type' => 'liability', 'is_postable' => false],
    ['code' => '211', 'name' => 'حساب‌های پرداختنی', 'parent_code' => '21', 'type' => 'liability', 'is_postable' => true],

    // The groups the product posts to. A chart that stops at 113/211 cannot book a cheque, a
    // fixed asset or a rent payment — those flows create their accounts on demand, but shipping
    // them named means a fresh shop opens its trial balance and recognises every line.
    // The four-digit numbering the product posts with, alongside the familiar 111/112/113:
    // a shop that keeps 111 as its drawer can point the `cash` role there from settings, and
    // one that starts fresh gets the codes the ledger actually writes to.
    ['code' => '1101', 'name' => 'حساب‌های دریافتنی', 'parent_code' => '11', 'type' => 'asset', 'is_postable' => true],
    ['code' => '1102', 'name' => 'موجودی نقد و صندوق', 'parent_code' => '11', 'type' => 'asset', 'is_postable' => true],
    ['code' => '1103', 'name' => 'موجودی بانک', 'parent_code' => '11', 'type' => 'asset', 'is_postable' => true],
    ['code' => '12', 'name' => 'دارایی‌های ثابت', 'parent_code' => '1', 'type' => 'asset', 'is_postable' => false],
    ['code' => '1201', 'name' => 'دارایی‌های ثابت', 'parent_code' => '12', 'type' => 'asset', 'is_postable' => true],
    ['code' => '1209', 'name' => 'استهلاک انباشته دارایی‌های ثابت', 'parent_code' => '12', 'type' => 'asset', 'is_postable' => true],
    ['code' => '1104', 'name' => 'چک‌های در جریان وصول', 'parent_code' => '11', 'type' => 'asset', 'is_postable' => true],
    ['code' => '13', 'name' => 'موجودی‌ها', 'parent_code' => '1', 'type' => 'asset', 'is_postable' => false],
    ['code' => '1301', 'name' => 'موجودی کالا', 'parent_code' => '13', 'type' => 'asset', 'is_postable' => true],
    ['code' => '2101', 'name' => 'مالیات بر ارزش افزوده پرداختنی', 'parent_code' => '21', 'type' => 'liability', 'is_postable' => true],
    ['code' => '2102', 'name' => 'حساب‌های پرداختنی تجاری', 'parent_code' => '21', 'type' => 'liability', 'is_postable' => true],
    ['code' => '2104', 'name' => 'حقوق پرداختنی', 'parent_code' => '21', 'type' => 'liability', 'is_postable' => true],
    ['code' => '2106', 'name' => 'چک‌های پرداختنی', 'parent_code' => '21', 'type' => 'liability', 'is_postable' => true],
    ['code' => '41', 'name' => 'درآمد فروش', 'parent_code' => '4', 'type' => 'revenue', 'is_postable' => false],
    ['code' => '4101', 'name' => 'درآمد فروش', 'parent_code' => '41', 'type' => 'revenue', 'is_postable' => true],
    ['code' => '4102', 'name' => 'برگشت از فروش', 'parent_code' => '41', 'type' => 'revenue', 'is_postable' => true],
    ['code' => '4103', 'name' => 'تخفیفات فروش', 'parent_code' => '41', 'type' => 'revenue', 'is_postable' => true],
    ['code' => '4104', 'name' => 'درآمد ارسال', 'parent_code' => '41', 'type' => 'revenue', 'is_postable' => true],
    ['code' => '42', 'name' => 'درآمد و سود سایر فعالیت‌ها', 'parent_code' => '4', 'type' => 'revenue', 'is_postable' => false],
    ['code' => '4201', 'name' => 'سود واگذاری دارایی', 'parent_code' => '42', 'type' => 'revenue', 'is_postable' => true],
    ['code' => '51', 'name' => 'بهای تمام‌شده', 'parent_code' => '5', 'type' => 'expense', 'is_postable' => false],
    ['code' => '5101', 'name' => 'بهای تمام‌شده کالای فروش‌رفته', 'parent_code' => '51', 'type' => 'expense', 'is_postable' => true],
    ['code' => '61', 'name' => 'هزینه‌های عملیاتی', 'parent_code' => '5', 'type' => 'expense', 'is_postable' => false],
    ['code' => '6101', 'name' => 'هزینه حقوق و دستمزد', 'parent_code' => '61', 'type' => 'expense', 'is_postable' => true],
    ['code' => '6102', 'name' => 'اجاره', 'parent_code' => '61', 'type' => 'expense', 'is_postable' => true],
    ['code' => '6103', 'name' => 'آب، برق و گاز', 'parent_code' => '61', 'type' => 'expense', 'is_postable' => true],
    ['code' => '6104', 'name' => 'تعمیر و نگهداری', 'parent_code' => '61', 'type' => 'expense', 'is_postable' => true],
    ['code' => '6105', 'name' => 'ملزومات', 'parent_code' => '61', 'type' => 'expense', 'is_postable' => true],
    ['code' => '6106', 'name' => 'حمل و نقل', 'parent_code' => '61', 'type' => 'expense', 'is_postable' => true],
    ['code' => '6107', 'name' => 'بازاریابی', 'parent_code' => '61', 'type' => 'expense', 'is_postable' => true],
    ['code' => '6108', 'name' => 'هزینه استهلاک', 'parent_code' => '61', 'type' => 'expense', 'is_postable' => true],
    ['code' => '6198', 'name' => 'زیان واگذاری دارایی', 'parent_code' => '61', 'type' => 'expense', 'is_postable' => true],
    ['code' => '6199', 'name' => 'سایر هزینه‌ها', 'parent_code' => '61', 'type' => 'expense', 'is_postable' => true],
];
