<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
class AcademyQuizQuestion extends Model {
    public const TYPE_SINGLE='single'; public const TYPE_MULTI='multi'; public const TYPE_BOOLEAN='boolean'; public const TYPE_SHORT='short';
    protected $fillable = ['quiz_id','type','prompt','options','correct','points','sort_order'];
    protected function casts(): array { return ['options'=>'array','correct'=>'array','points'=>'integer']; }
    public function quiz(): BelongsTo { return $this->belongsTo(AcademyQuiz::class, 'quiz_id'); }
}
