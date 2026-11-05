<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
class AcademyEnrollment extends Model {
    public const STATUS_ACTIVE='active'; public const STATUS_COMPLETED='completed'; public const STATUS_CANCELLED='cancelled';
    protected $fillable = ['tenant_id','course_id','user_id','order_id','status','enrolled_at','completed_at','progress_percent'];
    protected function casts(): array { return ['enrolled_at'=>'datetime','completed_at'=>'datetime','progress_percent'=>'integer']; }
    public function course(): BelongsTo { return $this->belongsTo(AcademyCourse::class, 'course_id'); }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function order(): BelongsTo { return $this->belongsTo(Order::class); }
    public function progress(): HasMany { return $this->hasMany(AcademyLessonProgress::class, 'enrollment_id'); }
    public function certificate(): HasOne { return $this->hasOne(AcademyCertificate::class, 'enrollment_id'); }
}
