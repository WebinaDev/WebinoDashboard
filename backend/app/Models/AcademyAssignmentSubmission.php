<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
class AcademyAssignmentSubmission extends Model {
    public const STATUS_SUBMITTED='submitted'; public const STATUS_GRADED='graded'; public const STATUS_RETURNED='returned';
    protected $fillable = ['assignment_id','user_id','tenant_id','body','file_path','file_name','status','score','feedback','graded_by','graded_at'];
    protected function casts(): array { return ['score'=>'integer','graded_at'=>'datetime']; }
    public function assignment(): BelongsTo { return $this->belongsTo(AcademyAssignment::class, 'assignment_id'); }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function grader(): BelongsTo { return $this->belongsTo(User::class, 'graded_by'); }
}
