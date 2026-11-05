<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
class AcademyCertificate extends Model {
    protected $fillable = ['tenant_id','course_id','user_id','enrollment_id','serial','student_name','course_title','pdf_path','issued_at','emailed_at'];
    protected function casts(): array { return ['issued_at'=>'datetime','emailed_at'=>'datetime']; }
    public function course(): BelongsTo { return $this->belongsTo(AcademyCourse::class, 'course_id'); }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function enrollment(): BelongsTo { return $this->belongsTo(AcademyEnrollment::class, 'enrollment_id'); }
}
