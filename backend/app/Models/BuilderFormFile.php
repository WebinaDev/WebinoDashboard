<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BuilderFormFile extends Model
{
    protected $fillable = ['tenant_id', 'form_key', 'token_hash', 'path', 'original_name', 'mime', 'size', 'submission_id'];
}
