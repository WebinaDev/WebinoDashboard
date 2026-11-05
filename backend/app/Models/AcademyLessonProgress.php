<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
class AcademyLessonProgress extends Model {
    public const STATUS_STARTED='started'; public const STATUS_COMPLETED='completed';
    protected $table = 'academy_lesson_progress';
    protected $fillable = ['enrollment_id','lesson_id','user_id','status','percent','started_at','completed_at'];
    protected function casts(): array { return ['percent'=>'integer','started_at'=>'datetime','completed_at'=>'datetime']; }
    public function enrollment(): BelongsTo { return $this->belongsTo(AcademyEnrollment::class, 'enrollment_id'); }
    public function lesson(): BelongsTo { return $this->belongsTo(AcademyLesson::class, 'lesson_id'); }
}
