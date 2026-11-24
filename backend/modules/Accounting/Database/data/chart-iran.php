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
];
