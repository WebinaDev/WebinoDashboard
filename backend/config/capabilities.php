<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Capability constants
    |--------------------------------------------------------------------------
    */

    'users.manage' => 'users.manage',
    'rbac.manage' => 'rbac.manage',
    'accounting.manage' => 'accounting.manage',
    'pos.use' => 'pos.use',
    'orders.own' => 'orders.own',
    'reviews.moderate' => 'reviews.moderate',
    'settings.manage' => 'settings.manage',
    'reports.shop' => 'reports.shop',
    'content.manage' => 'content.manage',
    'analytics.view' => 'analytics.view',
    'analytics.manage' => 'analytics.manage',
    'account.portal' => 'account.portal',
    'partner.portal' => 'partner.portal',
    'portal.read' => 'portal.read',

    /** Wildcard granting all capabilities (admin only). */
    'all' => '*',

    /*
    |--------------------------------------------------------------------------
    | Assignable capability strings (RBAC UI — no free-form strings)
    |--------------------------------------------------------------------------
    */

    'catalog' => [
        'users.manage',
        'rbac.manage',
        'accounting.manage',
        'pos.use',
        'orders.own',
        'reviews.moderate',
        'settings.manage',
        'reports.shop',
        'content.manage',
        'account.portal',
        'partner.portal',
        'portal.read',
        'commerce.*',
        'orders.*',
        'catalog.*',
        'marketing.*',
        'content.*',
        'analytics.view',
        'analytics.manage',
        'analytics.*',
        'reports.*',
        'support.*',
        'modules.*',
    ],

    /*
    |--------------------------------------------------------------------------
    | Predefined roles (users.role string values)
    |--------------------------------------------------------------------------
    */

    'roles' => [
        'admin',
        'staff',
        'shop_manager',
        'seller',
        'accountant',
        'author',
        'editor',
        'customer',
        'partner',
        'subscriber',
    ],

    /** Roles allowed into back-office APIs (EnsureStaffRole). */
    'staff_roles' => [
        'admin',
        'staff',
        'shop_manager',
        'seller',
        'accountant',
        'author',
        'editor',
    ],

    /*
    |--------------------------------------------------------------------------
    | API route prefix → required capability
    | Used for documentation and optional auto-gating helpers.
    |--------------------------------------------------------------------------
    */

    'route_prefixes' => [
        'api/v1/customers' => 'users.manage',
        'api/v1/staff' => 'users.manage',
        'api/v1/roles' => 'rbac.manage',
        'api/v1/accounting' => 'accounting.manage',
        'api/v1/products/pos-search' => 'pos.use',
        'api/v1/pos' => 'pos.use',
        'api/v1/product-reviews' => 'reviews.moderate',
        'api/v1/settings' => 'settings.manage',
    ],

];
