<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head><meta charset="utf-8"><style>
body{font-family:DejaVu Sans,sans-serif;direction:rtl;text-align:center;color:#1f2937}
.card{border:4px solid #0f766e;padding:48px 32px;margin:24px;border-radius:12px}
h1{font-size:28px;margin-bottom:8px;color:#0f766e}h2{font-size:22px;margin:24px 0 8px}
.serial{margin-top:32px;font-size:14px;color:#64748b}.meta{margin-top:12px;font-size:14px}
</style></head>
<body><div class="card">
<h1>گواهینامه پایان دوره</h1>
<p>بدین‌وسیله تأیید می‌شود که</p>
<h2>{{ $student_name }}</h2>
<p>دوره زیر را با موفقیت به پایان رسانده است:</p>
<h2>{{ $course_title }}</h2>
<p class="meta">تاریخ صدور: {{ $issued_at }}</p>
<p class="serial">شماره سریال: {{ $serial }}</p>
</div></body></html>
