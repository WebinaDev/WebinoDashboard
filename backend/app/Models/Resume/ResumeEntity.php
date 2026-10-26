<?php

namespace App\Models\Resume;

use App\Services\Resume\ResumeScope;
use Illuminate\Database\Eloquent\Model;

/** Base for every resume section table: tenant-scoped, mass-assignable except id/tenant_id. */
abstract class ResumeEntity extends Model
{
    protected $guarded = ['id', 'tenant_id'];

    protected static function booted(): void
    {
        ResumeScope::boot(static::class);
    }
}
