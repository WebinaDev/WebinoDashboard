<?php

namespace App\Services\Poetry;

use Illuminate\Support\Facades\DB;

/** Per-tenant default taxonomies, seeded on first use. Taxonomies only. No poems are seeded. Idempotent. */
class PoetryTaxonomy
{
    public const OCCASIONS = ['muharram' => 'محرم', 'fatemiyeh' => 'فاطمیه', 'ramadan' => 'ماه رمضان', 'births-martyrdoms' => 'شهادت‌ها و ولادت‌ها', 'madh-monajat' => 'مدح و مناجات', 'other' => 'سایر'];

    public const FIGURES = [
        'imam-hossein' => 'امام حسین', 'imam-hassan' => 'امام حسن مجتبی', 'abolfazl' => 'حضرت ابوالفضل', 'ali-akbar' => 'علی‌اکبر', 'ali-asghar' => 'علی‌اصغر',
        'zeynab' => 'زینب', 'roghayeh' => 'رقیه', 'imam-sajjad' => 'امام سجاد', 'moslem' => 'مسلم بن عقیل', 'habib' => 'حبیب بن مظاهر', 'hor' => 'حر',
        'ghasem' => 'حضرت قاسم', 'teflan-moslem' => 'طفلان مسلم', 'ashab' => 'اصحاب و شهدا', 'vorood-muharram' => 'ورود به محرم',
        'ashura' => 'شب و روز عاشورا', 'sham-ghariban' => 'شام غریبان', 'arbaeen' => 'اربعین', 'karevan-asra' => 'کاروان اسرا',
    ];

    public const STYLES = ['zamineh' => 'زمینه', 'rozeh' => 'روضه', 'noheh' => 'نوحه', 'vahed' => 'واحد', 'shoor' => 'شور', 'sineh-zani' => 'سینه‌زنی', 'zanjir-zani' => 'زنجیرزنی', 'sorood' => 'سرود', 'monajat' => 'مناجات', 'deklameh' => 'دکلمه'];

    public static function ensure(int $tenantId): void
    {
        if (DB::table('poetry_terms')->where('tenant_id', $tenantId)->exists()) {
            return;
        }
        $now = now();
        foreach (['occasion' => self::OCCASIONS, 'figure' => self::FIGURES, 'style' => self::STYLES] as $kind => $list) {
            $i = 0;
            foreach ($list as $slug => $name) {
                $exists = DB::table('poetry_terms')->where('tenant_id', $tenantId)->where('kind', $kind)->where('slug', $slug)->exists();
                if (! $exists) {
                    DB::table('poetry_terms')->insert(['tenant_id' => $tenantId, 'kind' => $kind, 'slug' => $slug, 'name' => $name, 'sort' => $i, 'created_at' => $now, 'updated_at' => $now]);
                }
                $i++;
            }
        }
    }
}
