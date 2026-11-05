<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
class AcademyQuizAttempt extends Model {
    protected $fillable = ['quiz_id','user_id','score','max_score','passed','answers','started_at','finished_at'];
    protected function casts(): array { return ['score'=>'integer','max_score'=>'integer','passed'=>'boolean','answers'=>'array','started_at'=>'datetime','finished_at'=>'datetime']; }
    public function quiz(): BelongsTo { return $this->belongsTo(AcademyQuiz::class, 'quiz_id'); }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
}
