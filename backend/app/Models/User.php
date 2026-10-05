<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

// Sensitive fields (role, tenant_id, wallet, 2FA) are intentionally omitted —
// trusted services must forceFill / assign them explicitly.
#[Fillable(['name', 'username', 'first_name', 'last_name', 'email', 'phone', 'national_id', 'job', 'birth_date', 'landline', 'password', 'password_must_change', 'is_active', 'bank_sheba', 'bank_name', 'bank_account', 'bank_card', 'loyalty_points', 'addresses', 'wishlist', 'ui_preferences'])]
#[Hidden(['password', 'remember_token', 'two_factor_secret', 'two_factor_recovery_codes'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'password_must_change' => 'boolean',
            'is_active' => 'boolean',
            'two_factor_confirmed_at' => 'datetime',
            'birth_date' => 'date',
            'wallet_balance_minor' => 'integer',
            'loyalty_points' => 'integer',
            'addresses' => 'array',
            'wishlist' => 'array',
            'ui_preferences' => 'array',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
