<?php
namespace App\Services\Academy;
use App\Models\AcademyCertificate;
use App\Models\AcademyEnrollment;
use App\Models\User;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
final class AcademyCertificateService
{
    public function issueIfEnabled(AcademyEnrollment $enrollment): ?AcademyCertificate
    {
        $enrollment->loadMissing('course', 'user');
        $course = $enrollment->course;
        if (! $course || ! $course->certificate_enabled) {
            return null;
        }
        $existing = AcademyCertificate::query()->where('enrollment_id', $enrollment->id)->first();
        if ($existing) {
            return $existing;
        }
        $user = $enrollment->user;
        $serial = $this->makeSerial((int) $enrollment->tenant_id);
        $cert = AcademyCertificate::query()->create([
            'tenant_id' => $enrollment->tenant_id,
            'course_id' => $course->id,
            'user_id' => $enrollment->user_id,
            'enrollment_id' => $enrollment->id,
            'serial' => $serial,
            'student_name' => trim((string) ($user?->name ?: 'زبان‌آموز')),
            'course_title' => (string) ($course->certificate_title ?: $course->title),
            'issued_at' => now(),
        ]);
        $path = $this->renderPdf($cert);
        if ($path) {
            $cert->update(['pdf_path' => $path]);
        }
        $this->emailCertificate($cert->fresh(), $user);
        return $cert->fresh();
    }
    public function makeSerial(int $tenantId): string
    {
        do {
            $serial = 'WB-'.strtoupper(Str::random(4)).'-'.strtoupper(Str::random(6));
        } while (AcademyCertificate::query()->where('tenant_id', $tenantId)->where('serial', $serial)->exists());
        return $serial;
    }
    public function renderPdf(AcademyCertificate $cert): ?string
    {
        $html = view('pdf.academy-certificate', [
            'serial' => $cert->serial,
            'student_name' => $cert->student_name,
            'course_title' => $cert->course_title,
            'issued_at' => optional($cert->issued_at)->timezone('Asia/Tehran')?->format('Y/m/d') ?? '',
        ])->render();
        $dir = 'academy/certificates/'.$cert->tenant_id;
        $filename = $dir.'/'.$cert->serial.'.pdf';
        if (class_exists(\Barryvdh\DomPDF\Facade\Pdf::class)) {
            $pdf = \Barryvdh\DomPDF\Facade\Pdf::loadHTML($html);
            Storage::disk('public')->put($filename, $pdf->output());
            return $filename;
        }
        $htmlPath = $dir.'/'.$cert->serial.'.html';
        Storage::disk('public')->put($htmlPath, $html);
        return $htmlPath;
    }
    public function emailCertificate(AcademyCertificate $cert, ?User $user): void
    {
        $email = $user?->email;
        if (! $email) {
            return;
        }
        try {
            Mail::raw("گواهینامه دوره «{$cert->course_title}» صادر شد.\nشماره سریال: {$cert->serial}", function ($message) use ($email, $cert) {
                $message->to($email)->subject('گواهینامه دوره '.$cert->course_title);
            });
            $cert->update(['emailed_at' => now()]);
        } catch (\Throwable) {
        }
    }
    public function verifyBySerial(string $serial, ?int $tenantId = null): ?AcademyCertificate
    {
        $q = AcademyCertificate::query()->where('serial', $serial);
        if ($tenantId) {
            $q->where('tenant_id', $tenantId);
        }
        return $q->first();
    }
}
