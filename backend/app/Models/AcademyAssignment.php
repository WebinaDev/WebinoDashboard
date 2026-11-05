<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
class AcademyAssignment extends Model {
    protected $fillable = ['lesson_id','instructions','max_score','allow_file','allow_text','due_at'];
    protected function casts(): array { return ['max_score'=>'integer','allow_file'=>'boolean','allow_text'=>'boolean','due_at'=>'datetime']; }
    public function lesson(): BelongsTo { return $this->belongsTo(AcademyLesson::class, 'lesson_id'); }
    public function submissions(): HasMany { return $this->hasMany(AcademyAssignmentSubmission::class, 'assignment_id'); }
}
