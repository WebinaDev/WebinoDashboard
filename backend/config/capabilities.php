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
    'activity.view' => 'activity.view',
    'content.manage' => 'content.manage',
    'analytics.view' => 'analytics.view',
    'analytics.manage' => 'analytics.manage',
    'account.portal' => 'account.portal',
    'partner.portal' => 'partner.portal',
    'portal.read' => 'portal.read',

    /*
    |--------------------------------------------------------------------------
    | Cafe operations — one capability per hard rule in the role matrix
    |--------------------------------------------------------------------------
    |
    | These exist so a role can be built out of narrow grants instead of one blunt
    | `pos.use`. A cashier holds the first four; a waiter holds `orders.floor`; a cook
    | holds only `kitchen.station`.
    */

    // Take an order and settle it.
    'orders.create' => 'orders.create',
    // Seat / clean / reserve a table, call the waiter. No money.
    'orders.floor' => 'orders.floor',
    // Count the drawer and submit it.
    'pos.reconcile' => 'pos.reconcile',
    // Move cash in/out of the drawer (paid-out, drop).
    'pos.cash' => 'pos.cash',
    // Approve a cash count someone else submitted.
    'pos.approve' => 'pos.approve',
    // Change a price on the menu or a line. Cashiers and waiters never hold this.
    'catalog.price' => 'catalog.price',
    // Void/delete an already-settled order. Deliberately rarer than taking one.
    'orders.void' => 'orders.void',
    // Read the full financial picture (P&L, tax, GL). Operational reports are `reports.shop`.
    'reports.financial' => 'reports.financial',
    // Approve/post an accounting document.
    'accounting.approve' => 'accounting.approve',
    // See and work the kitchen board; narrowed to assigned stations when the user has a
    // station membership, and to the whole board when they do not.
    'kitchen.view' => 'kitchen.view',
    // Only the tickets routed to your assigned station(s).
    'kitchen.station' => 'kitchen.station',
    // Manage branches, stations, and the tenant-wide settings.
    'branches.manage' => 'branches.manage',

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
        'accounting.approve',
        'pos.use',
        'pos.reconcile',
        'pos.cash',
        'pos.approve',
        'orders.own',
        'orders.create',
        'orders.floor',
        'orders.void',
        'catalog.price',
        'kitchen.view',
        'kitchen.station',
        'branches.manage',
        'reviews.moderate',
        'settings.manage',
        'reports.shop',
        'reports.financial',
        'activity.view',
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
        'activity.*',
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

        // Cafe operation roles. `seller` and `shop_manager` were too blunt for a counter
        // where a cashier must not reprice the menu and a waiter must not touch the drawer.
        'cashier',
        'waiter',
        'cook',
        'branch_manager',
        'owner',
    ],

    /*
    |--------------------------------------------------------------------------
    | Cafe role matrix (role => capability => hard limits)
    |--------------------------------------------------------------------------
    |
    | Seeded into `role_capabilities` by the multi-branch migration and shown as the
    | starting point in the RBAC screen. Everything here is a *grant*; the prohibitions in
    | the spec are enforced by simply not granting the capability.
    |
    |   cashier        order, settle, count drawer, floor view, customers — no repricing,
    |                  no voiding a settled order, no financial reports, no settings
    |   waiter         floor orders, table state, call — no drawer, no money at all
    |   cook           assigned station board only — nothing else
    |   branch_manager everything operational + approve counts + operational reports,
    |                  no tenant settings, no advanced accounting
    |   accountant     full finance + financial reports + approve documents,
    |                  no day-to-day till operation
    |   owner          everything
    */
    'cafe_roles' => [
        'cashier' => [
            'pos.use',
            'orders.create',
            'orders.floor',
            'orders.own',
            'pos.reconcile',
            'pos.cash',
            'reports.shop',
            'activity.view',
        ],
        'waiter' => [
            'orders.create',
            'orders.floor',
            'orders.own',
        ],
        'cook' => [
            'kitchen.view',
            'kitchen.station',
        ],
        'branch_manager' => [
            'pos.use',
            'pos.reconcile',
            'pos.approve',
            'pos.cash',
            'orders.create',
            'orders.floor',
            'orders.own',
            'orders.*',
            'orders.void',
            'catalog.*',
            'catalog.price',
            'kitchen.view',
            'kitchen.station',
            'reports.shop',
            'reports.*',
            'users.manage',
            'activity.view',
            'branches.manage',
        ],
        'accountant' => [
            'accounting.manage',
            'accounting.approve',
            'reports.shop',
            'reports.financial',
            'reports.*',
            'activity.view',
        ],
        'owner' => [
            '*',
        ],
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
        // Cafe counter roles are staff with a dashboard, not customers.
        'cashier',
        'waiter',
        'cook',
        'branch_manager',
        'owner',
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
        'api/v1/activity' => 'activity.view',
        'api/v1/cafe/branches' => 'branches.manage',
        'api/v1/cafe/stations' => 'branches.manage',
        'api/v1/cafe/stock' => 'catalog.*',
    ],

];
