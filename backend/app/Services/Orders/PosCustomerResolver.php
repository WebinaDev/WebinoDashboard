<?php

namespace App\Services\Orders;

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Find or create a customer user for POS / pay-link when staff enters phone/name.
 */
class PosCustomerResolver
{
    /**
     * @param  array{user_id?: mixed, customer_phone?: mixed, customer_name?: mixed, customer_email?: mixed}  $data
     * @return array{user_id: int|null, created: bool}
     */
    public function resolve(int $tenantId, array $data, bool $autoCreate = true): array
    {
        $userId = isset($data['user_id']) ? (int) $data['user_id'] : 0;
        if ($userId > 0) {
            $exists = User::query()->where('tenant_id', $tenantId)->whereKey($userId)->exists();

            return ['user_id' => $exists ? $userId : null, 'created' => false];
        }

        $phone = $this->digits((string) ($data['customer_phone'] ?? ''));
        $email = trim((string) ($data['customer_email'] ?? ''));
        $name = trim((string) ($data['customer_name'] ?? ''));

        if ($phone !== '') {
            $found = $this->findByPhone($tenantId, $phone);
            if ($found) {
                if ($name !== '' && trim((string) $found->name) === '') {
                    $found->forceFill(['name' => $name])->save();
                }

                return ['user_id' => (int) $found->id, 'created' => false];
            }
        }

        if ($email !== '') {
            $found = User::query()
                ->where('tenant_id', $tenantId)
                ->where('email', $email)
                ->first();
            if ($found) {
                return ['user_id' => (int) $found->id, 'created' => false];
            }
        }

        if (! $autoCreate || ($phone === '' && $email === '')) {
            return ['user_id' => null, 'created' => false];
        }

        if ($email === '' && $phone !== '') {
            $host = 'localhost';
            $email = 'pos+'.$phone.'@'.$host;
        }

        $user = new User;
        $user->forceFill([
            'tenant_id' => $tenantId,
            'name' => $name !== '' ? $name : ($phone !== '' ? $phone : 'POS customer'),
            'email' => $email !== '' ? $email : null,
            'phone' => $phone !== '' ? $phone : null,
            'password' => Hash::make(Str::random(24)),
            'role' => 'customer',
            'is_active' => true,
            'wallet_balance_minor' => 0,
        ])->save();

        return ['user_id' => (int) $user->id, 'created' => true];
    }

    public function findByPhone(int $tenantId, string $phone): ?User
    {
        $digits = $this->digits($phone);
        if ($digits === '') {
            return null;
        }

        $candidates = User::query()
            ->where('tenant_id', $tenantId)
            ->whereNotNull('phone')
            ->where('phone', '!=', '')
            ->limit(200)
            ->get(['id', 'phone', 'name', 'email']);

        foreach ($candidates as $u) {
            if ($this->digits((string) $u->phone) === $digits) {
                return $u;
            }
        }

        // Also match trailing 10 digits (Iran mobile without country code).
        $tail = strlen($digits) >= 10 ? substr($digits, -10) : $digits;
        foreach ($candidates as $u) {
            $p = $this->digits((string) $u->phone);
            if ($p !== '' && (str_ends_with($p, $tail) || str_ends_with($tail, $p))) {
                return $u;
            }
        }

        return null;
    }

    public function digits(string $value): string
    {
        $map = ['۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9'];
        $value = strtr($value, $map);

        return preg_replace('/\D+/', '', $value) ?? '';
    }
}
