<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
class AcademyReview extends Model {
    public const STATUS_PENDING='pending'; public const STATUS_APPROVED='approved'; public const STATUS_SPAM='spam'; public const STATUS_TRASH='trash';
    protected $fillable = ['tenant_id','course_id','user_id','rating','body','author_name','status','admin_reply'];
    protected function casts(): array { return ['rating'=>'integer']; }
    public function course(): BelongsTo { return $this->belongsTo(AcademyCourse::class, 'course_id'); }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
}
