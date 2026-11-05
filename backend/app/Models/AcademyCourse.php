<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
class AcademyCourse extends Model
{
    protected $fillable = [
        'tenant_id','product_id','slug','title','description','cover_url','published','sort_order',
        'is_free','price_minor','level','duration_minutes','instructor_name','instructor_bio','instructor_avatar_url',
        'certificate_enabled','certificate_title','drip_enabled','students_count','rating_avg','rating_count','meta',
    ];
    protected function casts(): array {
        return ['published'=>'boolean','is_free'=>'boolean','certificate_enabled'=>'boolean','drip_enabled'=>'boolean','price_minor'=>'integer','duration_minutes'=>'integer','students_count'=>'integer','rating_avg'=>'float','rating_count'=>'integer','meta'=>'array'];
    }
    public function tenant(): BelongsTo { return $this->belongsTo(Tenant::class); }
    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
    public function sections(): HasMany { return $this->hasMany(AcademySection::class, 'course_id')->orderBy('sort_order'); }
    public function lessons(): HasMany { return $this->hasMany(AcademyLesson::class, 'course_id')->orderBy('sort_order'); }
    public function enrollments(): HasMany { return $this->hasMany(AcademyEnrollment::class, 'course_id'); }
    public function reviews(): HasMany { return $this->hasMany(AcademyReview::class, 'course_id'); }
    public function certificates(): HasMany { return $this->hasMany(AcademyCertificate::class, 'course_id'); }
    public function scopePublished($query) { return $query->where('published', true); }
}
