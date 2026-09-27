<?php

namespace App\Services\Auth;

use App\Services\Marketplace\Adapters\TorobAdapter;
use Illuminate\Http\Exceptions\HttpResponseException;

final class OtpIdentifier
{
    /**
     * @return array{raw: string, key: string, phone: string, email: string}
     */
    public static function parse(string $identifier): array
    {
        $raw = trim($identifier);
        if ($raw === '') {
            throw self::validation(__('auth.otp_identifier_required'));
        }

        $email = '';
        $phone = '';
        if (filter_var($raw, FILTER_VALIDATE_EMAIL)) {
            $email = strtolower($raw);
        } else {
            $normalized = TorobAdapter::normalizePhone($raw);
            if ($normalized === null) {
                $digits = preg_replace('/\D+/', '', $raw);
                if (is_string($digits) && strlen($digits) >= 10 && strlen($digits) <= 15) {
                    $phone = $digits;
                } else {
                    throw self::validation(__('auth.otp_identifier_invalid'));
                }
            } else {
                $phone = $normalized;
            }
        }

        $key = $email !== '' ? 'e_'.md5($email) : 'p_'.$phone;

        return [
            'raw' => $raw,
            'key' => $key,
            'phone' => $phone,
            'email' => $email,
        ];
    }

    private static function validation(string $message): HttpResponseException
    {
        return new HttpResponseException(response()->json([
            'message' => $message,
            'errors' => ['identifier' => [$message]],
        ], 422));
    }
}
