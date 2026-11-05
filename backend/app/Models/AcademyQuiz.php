<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
class AcademyQuiz extends Model {
    protected $fillable = ['lesson_id','pass_mark','max_attempts','time_limit_seconds','shuffle_questions'];
    protected function casts(): array { return ['pass_mark'=>'integer','max_attempts'=>'integer','time_limit_seconds'=>'integer','shuffle_questions'=>'boolean']; }
    public function lesson(): BelongsTo { return $this->belongsTo(AcademyLesson::class, 'lesson_id'); }
    public function questions(): HasMany { return $this->hasMany(AcademyQuizQuestion::class, 'quiz_id')->orderBy('sort_order'); }
    public function attempts(): HasMany { return $this->hasMany(AcademyQuizAttempt::class, 'quiz_id'); }
}
