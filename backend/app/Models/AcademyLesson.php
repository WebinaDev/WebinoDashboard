<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
class AcademyLesson extends Model
{
    public const TYPE_VIDEO='video'; public const TYPE_AUDIO='audio'; public const TYPE_TEXT='text';
    public const TYPE_FILE='file'; public const TYPE_QUIZ='quiz'; public const TYPE_ASSIGNMENT='assignment';
    public const TYPES = [self::TYPE_VIDEO,self::TYPE_AUDIO,self::TYPE_TEXT,self::TYPE_FILE,self::TYPE_QUIZ,self::TYPE_ASSIGNMENT];
    protected $fillable = [
        'course_id','section_id','slug','title','type','content','video_url','audio_url','file_path','file_name',
        'duration_seconds','sort_order','published','is_preview','drip_days','requires_pass_lesson_id','meta',
    ];
    protected function casts(): array {
        return ['published'=>'boolean','is_preview'=>'boolean','duration_seconds'=>'integer','drip_days'=>'integer','meta'=>'array'];
    }
    public function course(): BelongsTo { return $this->belongsTo(AcademyCourse::class, 'course_id'); }
    public function section(): BelongsTo { return $this->belongsTo(AcademySection::class, 'section_id'); }
    public function quiz(): HasOne { return $this->hasOne(AcademyQuiz::class, 'lesson_id'); }
    public function assignment(): HasOne { return $this->hasOne(AcademyAssignment::class, 'lesson_id'); }
}
