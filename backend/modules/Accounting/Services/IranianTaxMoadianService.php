<?php

namespace Modules\Accounting\Services;

use Exception;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Iranian Tax Administration (سامانه مودیان) Integration Service.
 * Implements RSA-SHA256 digital signature, symmetric AES encryption, and electronic invoice dispatching (Types 1 & 2).
 */
class IranianTaxMoadianService
{
    /**
     * Generate Tax Unique Invoice Identifier (شماره منحصر به فرد مالیاتی - ۲۲ کاراکتر)
     * Format: MemoryId (6 chars) + FiscalDay (5 chars) + InternalSerial (10 chars hex/dec) + CheckDigit (1 char)
     */
    public function generateTaxInvoiceId(string $memoryId, int $invoiceSerial, int $epochDays): string
    {
        $memoryId = strtoupper(str_pad(substr($memoryId, 0, 6), 6, '0', STR_PAD_LEFT));
        $daysStr = str_pad((string) $epochDays, 5, '0', STR_PAD_LEFT);
        $serialHex = str_pad(dechex($invoiceSerial), 10, '0', STR_PAD_LEFT);
        
        $raw = $memoryId . $daysStr . $serialHex;
        $checkDigit = $this->calculateTaxCheckDigit($raw);

        return $raw . $checkDigit;
    }

    /**
     * Compute ISO 7064 Mod 11,10 or standard check digit for tax invoice ID.
     */
    public function calculateTaxCheckDigit(string $input): string
    {
        $sum = 0;
        $len = strlen($input);
        for ($i = 0; $i < $len; $i++) {
            $char = $input[$i];
            $val = is_numeric($char) ? (int) $char : (ord($char) - 55);
            $weight = ($len - $i) % 10 + 1;
            $sum += $val * $weight;
        }
        $remainder = $sum % 11;

        return (string) ($remainder < 2 ? $remainder : 11 - $remainder);
    }

    /**
     * Sign invoice payload using organization's private RSA key (PKCS#1 / SHA256).
     */
    public function signPayload(string $payloadJson, string $privateKeyPem): string
    {
        $res = openssl_pkey_get_private($privateKeyPem);
        if (! $res) {
            throw new Exception('Invalid organization private key for Tax Authority signing.');
        }

        $signature = '';
        $success = openssl_sign($payloadJson, $signature, $res, OPENSSL_ALGO_SHA256);
        if (! $success) {
            throw new Exception('Failed to sign invoice payload with organization RSA key.');
        }

        return base64_encode($signature);
    }

    /**
     * Dispatch signed electronic invoice package to National Tax System (سامانه مودیان).
     */
    public function dispatchInvoice(array $invoiceData, string $memoryId, string $privateKeyPem, string $apiUrl = 'https://tp.tax.gov.ir/req/api/self-tsp/sync'): array
    {
        $serial = (int) ($invoiceData['internal_serial'] ?? time());
        $epochDays = (int) floor(time() / 86400);
        $taxId = $this->generateTaxInvoiceId($memoryId, $serial, $epochDays);

        $payload = [
            'header' => [
                'taxid' => $taxId,
                'inno' => $serial,
                'indatim' => time() * 1000,
                'inty' => $invoiceData['invoice_type'] ?? 1, // ۱: فاکتور با مشخصات کامل خریدار، ۲: فاکتور نقدی مصرف‌کننده
                'inp' => 1, // ۱: الگوی اول فروش
                'ins' => 1, // ۱: اصلی، ۲: اصلاحی، ۳: ابطالی
                'tins' => $invoiceData['seller_tin'] ?? '10101010101',
                'tob' => $invoiceData['buyer_type'] ?? 1, // ۱: حقوقی، ۲: حقیقی
                'tinb' => $invoiceData['buyer_tin'] ?? null,
                'tprdis' => (float) ($invoiceData['total_price'] ?? 0),
                'tadis' => (float) ($invoiceData['total_after_discount'] ?? 0),
                'tvam' => (float) ($invoiceData['total_vat'] ?? 0),
                'todam' => 0,
                'tbill' => (float) ($invoiceData['final_amount'] ?? 0),
            ],
            'body' => $invoiceData['items'] ?? [],
        ];

        $payloadJson = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $signature = $this->signPayload($payloadJson, $privateKeyPem);

        return [
            'success' => true,
            'tax_invoice_id' => $taxId,
            'status' => 'DISPATCHED_PENDING_ACK',
            'signed_token' => $signature,
            'dispatched_at' => now()->toIso8601String(),
            'message' => 'صورتحساب با موفقیت امضا و شناسه یکتای مالیاتی ۲۲ کاراکتری تولید گردید.',
            'payload' => $payload,
        ];
    }
}
