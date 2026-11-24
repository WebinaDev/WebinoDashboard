<?php

namespace App\Services\Webhooks;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

/**
 * Posts queued webhook deliveries.
 *
 * Queuing without sending is half a feature: the deliveries table fills up and every
 * integration the shop configured silently receives nothing. This is the other half, run from
 * the scheduler.
 *
 * Three rules, each learned from how webhook systems usually fail:
 *
 *  1. **A failure is retried with a ceiling.** A dead endpoint should stop being hammered, and
 *     the person who configured it should see *why* rather than a silent zero.
 *  2. **A 4xx is not retried.** The endpoint said the payload is wrong; sending it again five
 *     times just logs the same error five times.
 *  3. **The signature covers the exact body sent.** Re-encoding the payload before signing
 *     would produce a signature the receiver cannot verify.
 */
final class WebhookSender
{
    /** Give up after this many attempts. */
    private const MAX_ATTEMPTS = 5;

    /** Seconds to wait for an endpoint before calling it failed. */
    private const TIMEOUT = 8;

    /** @return array{sent: int, failed: int, skipped: int} */
    public function flush(int $limit = 50): array
    {
        if (! \Illuminate\Support\Facades\Schema::hasTable('cafe_webhook_deliveries')) {
            return ['sent' => 0, 'failed' => 0, 'skipped' => 0];
        }

        $rows = DB::table('cafe_webhook_deliveries as d')
            ->join('cafe_webhooks as w', 'd.webhook_id', '=', 'w.id')
            ->where('d.status', 'queued')
            ->where('w.is_active', true)
            ->where('d.attempts', '<', self::MAX_ATTEMPTS)
            ->orderBy('d.id')
            ->limit($limit)
            ->select(['d.*', 'w.url', 'w.secret'])
            ->get();

        $sent = 0;
        $failed = 0;
        $skipped = 0;

        foreach ($rows as $row) {
            $body = (string) ($row->payload ?? '{}');
            $signature = hash_hmac('sha256', $body, (string) $row->secret);

            try {
                $response = Http::timeout(self::TIMEOUT)
                    ->withHeaders([
                        'Content-Type' => 'application/json',
                        'X-Webino-Event' => (string) $row->event,
                        'X-Webino-Signature' => $signature,
                        'X-Webino-Delivery' => (string) $row->id,
                    ])
                    ->withBody($body, 'application/json')
                    ->post((string) $row->url);
            } catch (\Throwable $e) {
                $this->markFailed($row, $e->getMessage());

                $failed++;
                continue;
            }

            if ($response->successful()) {
                DB::table('cafe_webhook_deliveries')->where('id', $row->id)->update([
                    'status' => 'delivered',
                    'response_status' => $response->status(),
                    'attempts' => (int) $row->attempts + 1,
                    'delivered_at' => now(),
                    'error' => null,
                    'updated_at' => now(),
                ]);

                DB::table('cafe_webhooks')->where('id', $row->webhook_id)->update([
                    'last_success_at' => now(),
                    'last_error' => null,
                    'updated_at' => now(),
                ]);

                $sent++;
                continue;
            }

            $error = 'HTTP '.$response->status().' '.mb_substr($response->body(), 0, 200);

            // A 4xx is the endpoint refusing this payload; retrying changes nothing.
            $permanent = $response->clientError();

            $this->markFailed($row, $error, $permanent);
            $failed++;
        }

        return ['sent' => $sent, 'failed' => $failed, 'skipped' => $skipped];
    }

    private function markFailed(object $row, string $error, bool $permanent = false): void
    {
        $attempts = (int) $row->attempts + 1;

        DB::table('cafe_webhook_deliveries')->where('id', $row->id)->update([
            'status' => $permanent || $attempts >= self::MAX_ATTEMPTS ? 'failed' : 'queued',
            'attempts' => $attempts,
            'error' => mb_substr($error, 0, 500),
            'updated_at' => now(),
        ]);

        DB::table('cafe_webhooks')->where('id', $row->webhook_id)->update([
            'last_failure_at' => now(),
            'last_error' => mb_substr($error, 0, 500),
            'updated_at' => now(),
        ]);
    }
}
