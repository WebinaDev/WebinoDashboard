<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Storefront navigation menu (admin «منوها»). Cafe digital menus live in {@see Menu}. */
class NavMenu extends Model
{
    public const LOCATIONS = ['header_main', 'top_bar', 'mobile', 'mega_menu', 'footer_1', 'footer_2', 'footer_3', 'footer_4', 'footer_bottom'];

    protected $fillable = ['tenant_id', 'name', 'slug', 'items', 'locations'];

    protected $casts = ['items' => 'array', 'locations' => 'array'];
}
