<?php

namespace App\Services\WordpressImport;

use App\Models\Order;
use App\Models\OrderReturn;
use App\Models\SupportTicket;
use App\Models\SupportTicketReply;
use App\Models\User;
use App\Models\WalletLedger;
use App\Models\WordpressImportJob;
use App\Models\WordpressImportLink;
use App\Models\WordpressImportQueue;
use Illuminate\Support\Facades\DB;

/**
 * Operator queue for import rows that have no automatic destination,
 * plus apply for wallet ledger, support tickets, and order returns
 * when the matching customer or order was already imported.
 */
final class WordpressImportReviewQueue
{
    public function __construct(private readonly WordpressImportMapper $mapper) {}

    /** @return array<string, mixed> */
    public function present(WordpressImportQueue $row): array
    {
        $type = $this->type($row);
        $payload = is_array($row->payload) ? $row->payload : [];

        return [
            'id' => (int) $row->id,
            'job_id' => $row->job_id ? (int) $row->job_id : null,
            'resource' => $row->resource,
            'external_id' => $row->external_id,
            'label' => $row->label,
            'status' => $row->status,
            'status_label' => $row->status === 'needs_mapping' ? 'pending' : $row->status,
            'type' => $type,
            'payload_preview' => $this->preview($payload),
            'can_apply' => $this->canApply($row),
        ];
    }

    public function canApply(WordpressImportQueue $row): bool
    {
        return in_array($this->type($row), ['wallet', 'ticket', 'return'], true)
            && in_array($row->status, ['needs_mapping', 'reviewed'], true);
    }

    /**
     * Apply every still-pending wallet, ticket, and return row for a job.
     * Settings slices and waiting-list rows stay for the operator.
     */
    public function applyPending(int $tenantId, ?int $jobId = null): int
    {
        $query = WordpressImportQueue::query()
            ->where('tenant_id', $tenantId)
            ->where('status', 'needs_mapping');
        if ($jobId) {
            $query->where('job_id', $jobId);
        }
        $applied = 0;
        foreach ($query->orderBy('id')->get() as $row) {
            if (! $this->canApply($row)) {
                continue;
            }
            if ($this->apply($row)['applied']) {
                $applied++;
            }
        }

        return $applied;
    }

    /**
     * @return array{applied: bool, message: string, local_type: ?string, local_id: ?int}
     */
    public function apply(WordpressImportQueue $row): array
    {
        if ($row->status === 'applied') {
            return $this->result(true, 'Already applied.', null, null);
        }
        if ($row->status === 'dismissed') {
            return $this->result(false, 'Dismissed rows are not applied.', null, null);
        }
        $type = $this->type($row);
        $result = match ($type) {
            'wallet' => $this->applyWallet($row),
            'ticket' => $this->applyTicket($row),
            'return' => $this->applyReturn($row),
            'settings_slice' => $this->result(false, 'This settings slice has no destination model. Mark it reviewed or dismiss it.', null, null),
            'waiting_list' => $this->result(false, 'Waiting-list rows have no destination model. Mark them reviewed or dismiss them.', null, null),
            default => $this->result(false, 'This queue row cannot be applied automatically.', null, null),
        };
        if ($result['applied']) {
            $row->status = 'applied';
            $row->save();
            $this->touchSummary($row, 'applied');
        }

        return $result;
    }

    public function type(WordpressImportQueue $row): string
    {
        if (str_starts_with($row->resource, 'settings_')) {
            return 'settings_slice';
        }
        if ($row->resource === 'waiting_list') {
            return 'waiting_list';
        }
        if ($row->resource === 'review_queue') {
            $payload = is_array($row->payload) ? $row->payload : [];
            $kind = strtolower(trim((string) ($payload['kind'] ?? '')));

            return match ($kind) {
                'wallet' => 'wallet',
                'tickets', 'ticket' => 'ticket',
                'returns', 'return' => 'return',
                default => 'review_queue',
            };
        }

        return match ($row->resource) {
            'wallet' => 'wallet',
            'tickets' => 'ticket',
            'returns' => 'return',
            default => $row->resource,
        };
    }

    /**
     * @return array{applied: bool, message: string, local_type: ?string, local_id: ?int}
     */
    private function applyWallet(WordpressImportQueue $row): array
    {
        $record = $this->record($row);
        $userExternal = trim((string) ($record['user_id'] ?? $record['customer_external_id'] ?? $record['user_external_id'] ?? ''));
        $userId = $this->localId($row->tenant_id, 'customers', $userExternal, User::class);
        if (! $userId) {
            return $this->result(false, 'Wallet row needs an imported customer (user_id '.$userExternal.').', null, null);
        }
        $direction = strtolower(trim((string) ($record['direction'] ?? 'credit')));
        $rawAmount = $record['amount'] ?? $record['balance'] ?? 0;
        if (! in_array($direction, ['credit', 'debit'], true)) {
            $direction = is_numeric($rawAmount) && (float) $rawAmount < 0 ? 'debit' : 'credit';
        }
        $amountMinor = $this->amountMinor($row, $record, 'amount');
        if ($amountMinor < 1 && isset($record['balance'])) {
            $amountMinor = $this->amountMinor($row, $record, 'balance');
        }
        if ($amountMinor < 1) {
            return $this->result(false, 'Wallet row has no positive amount.', null, null);
        }
        $external = (string) $row->external_id;
        $existing = $this->linkedId($row->tenant_id, 'wallet_ledger', $external);
        if ($existing) {
            return $this->result(true, 'Wallet ledger row was already applied.', WalletLedger::class, $existing);
        }

        $ledgerId = DB::transaction(function () use ($row, $userId, $direction, $amountMinor, $record, $external) {
            $user = User::query()->where('tenant_id', $row->tenant_id)->lockForUpdate()->findOrFail($userId);
            $current = (int) WalletLedger::query()
                ->where('tenant_id', $row->tenant_id)
                ->where('user_id', $user->id)
                ->where('direction', 'credit')
                ->sum('amount_minor')
                - (int) WalletLedger::query()
                    ->where('tenant_id', $row->tenant_id)
                    ->where('user_id', $user->id)
                    ->where('direction', 'debit')
                    ->sum('amount_minor');
            $next = $direction === 'credit' ? $current + $amountMinor : $current - $amountMinor;
            $note = trim((string) ($record['note'] ?? ''));
            $sourceReason = trim((string) ($record['reason'] ?? ''));
            if ($sourceReason !== '' && $sourceReason !== $this->walletReason($sourceReason)) {
                $note = trim($note.' source_reason:'.$sourceReason);
            }
            $ledger = WalletLedger::query()->create([
                'tenant_id' => $row->tenant_id,
                'user_id' => $user->id,
                'direction' => $direction,
                'amount_minor' => $amountMinor,
                'balance_after_minor' => max(0, $next),
                'reason' => $this->walletReason($sourceReason),
                'ref_type' => 'wordpress_import',
                'ref_id' => null,
                'note' => mb_substr(trim($note.' wp:'.$external), 0, 2000),
            ]);
            $user->wallet_balance_minor = max(0, $next);
            $user->save();
            $this->link($row->tenant_id, 'wallet_ledger', $external, WalletLedger::class, (int) $ledger->id);

            return (int) $ledger->id;
        });

        return $this->result(true, 'Wallet ledger row applied.', WalletLedger::class, $ledgerId);
    }

    /**
     * @return array{applied: bool, message: string, local_type: ?string, local_id: ?int}
     */
    private function applyTicket(WordpressImportQueue $row): array
    {
        $record = $this->record($row);
        $subject = trim((string) ($record['subject'] ?? $record['title'] ?? ''));
        $userExternal = trim((string) ($record['user_id'] ?? $record['customer_external_id'] ?? $record['user_external_id'] ?? ''));
        $userId = $this->localId($row->tenant_id, 'customers', $userExternal, User::class);
        if ($subject === '' || ! $userId) {
            return $this->result(false, 'Ticket needs a subject and an imported customer.', null, null);
        }
        $external = (string) $row->external_id;
        $existing = $this->linkedId($row->tenant_id, 'tickets', $external);
        if ($existing) {
            return $this->result(true, 'Ticket was already applied.', SupportTicket::class, $existing);
        }
        $status = strtolower(trim((string) ($record['status'] ?? 'open')));
        $status = match ($status) {
            'open', 'pending', 'closed' => $status,
            'answered', 'customer-reply', 'waiting' => 'pending',
            'resolved', 'solved' => 'closed',
            default => 'open',
        };
        $ticket = SupportTicket::query()->create([
            'tenant_id' => $row->tenant_id,
            'user_id' => $userId,
            'subject' => mb_substr($subject, 0, 190),
            'status' => $status,
        ]);
        $bodies = [];
        if (trim((string) ($record['body'] ?? $record['message'] ?? '')) !== '') {
            $bodies[] = ['body' => (string) ($record['body'] ?? $record['message']), 'is_staff' => false];
        }
        foreach (is_array($record['replies'] ?? null) ? $record['replies'] : [] as $reply) {
            if (is_array($reply) && trim((string) ($reply['body'] ?? '')) !== '') {
                $bodies[] = $reply;
            }
        }
        foreach ($bodies as $reply) {
            SupportTicketReply::query()->create([
                'tenant_id' => $row->tenant_id,
                'ticket_id' => $ticket->id,
                'user_id' => $userId,
                'is_staff' => (bool) ($reply['is_staff'] ?? false),
                'body' => mb_substr((string) ($reply['body'] ?? ''), 0, 20000),
                'created_at' => now(),
            ]);
        }
        $this->link($row->tenant_id, 'tickets', $external, SupportTicket::class, (int) $ticket->id);

        return $this->result(true, 'Support ticket applied.', SupportTicket::class, (int) $ticket->id);
    }

    /**
     * @return array{applied: bool, message: string, local_type: ?string, local_id: ?int}
     */
    private function applyReturn(WordpressImportQueue $row): array
    {
        $record = $this->record($row);
        $orderExternal = trim((string) ($record['order_external_id'] ?? $record['order_id'] ?? ''));
        $orderId = $this->localId($row->tenant_id, 'orders', $orderExternal, Order::class);
        if (! $orderId) {
            return $this->result(false, 'Return needs an imported order (order_id '.$orderExternal.').', null, null);
        }
        $external = (string) $row->external_id;
        $existing = $this->linkedId($row->tenant_id, 'returns', $external);
        if ($existing) {
            return $this->result(true, 'Return was already applied.', OrderReturn::class, $existing);
        }
        $order = Order::query()->where('tenant_id', $row->tenant_id)->findOrFail($orderId);
        $status = strtolower(trim((string) ($record['status'] ?? 'requested')));
        if (! in_array($status, ['requested', 'approved', 'rejected', 'received', 'refunded'], true)) {
            $status = 'requested';
        }
        $items = is_array($record['items'] ?? null) ? $record['items'] : [[
            'name' => (string) ($record['item_name'] ?? ''),
            'qty' => $record['qty'] ?? 1,
            'product_id' => $record['product_id'] ?? null,
            'order_item_id' => $record['order_item_id'] ?? null,
        ]];
        $refund = $this->amountMinor($row, $record, 'amount');
        if ($refund < 1) {
            $refund = $this->amountMinor($row, $record, 'refund');
        }
        $created = OrderReturn::query()->create([
            'tenant_id' => $row->tenant_id,
            'order_id' => $order->id,
            'user_id' => $order->user_id,
            'status' => $status,
            'reason' => $this->text($record['reason'] ?? null, 5000),
            'items' => $items,
            'refund_minor' => $refund > 0 ? $refund : null,
            'admin_note' => $this->text(trim((string) ($record['note'] ?? '').' wp:'.$external), 5000),
        ]);
        $this->link($row->tenant_id, 'returns', $external, OrderReturn::class, (int) $created->id);

        return $this->result(true, 'Order return applied.', OrderReturn::class, (int) $created->id);
    }

    /** @param  array<string, mixed>  $payload */
    private function preview(array $payload): string
    {
        $encoded = json_encode($this->shrink($payload), JSON_UNESCAPED_UNICODE);
        if (! is_string($encoded)) {
            return '';
        }

        return mb_strlen($encoded) > 500 ? mb_substr($encoded, 0, 500).'…' : $encoded;
    }

    private function shrink(mixed $value, int $depth = 0): mixed
    {
        if (is_string($value)) {
            return mb_strlen($value) > 180 ? mb_substr($value, 0, 180).'…' : $value;
        }
        if (! is_array($value) || $depth > 2) {
            return is_array($value) ? '[…]' : $value;
        }
        $out = [];
        $i = 0;
        foreach ($value as $key => $item) {
            if ($i >= 12) {
                $out['…'] = 'truncated';
                break;
            }
            $out[$key] = $this->shrink($item, $depth + 1);
            $i++;
        }

        return $out;
    }

    /** @return array<string, mixed> */
    private function record(WordpressImportQueue $row): array
    {
        $payload = is_array($row->payload) ? $row->payload : [];
        $record = is_array($payload['record'] ?? null) ? $payload['record'] : [];

        return $record !== [] ? array_replace($payload, $record) : $payload;
    }

    /** @param  array<string, mixed>  $record */
    private function amountMinor(WordpressImportQueue $row, array $record, string $key): int
    {
        $minorKey = $key.'_minor';
        if (isset($record[$minorKey]) && is_numeric($record[$minorKey])) {
            return max(0, (int) round((float) $record[$minorKey]));
        }
        if (! isset($record[$key]) || ! is_numeric($record[$key])) {
            return 0;
        }
        $job = $row->job_id ? WordpressImportJob::query()->find($row->job_id) : null;
        $options = $job && is_array($job->options) ? $job->options : [];
        $currency = (string) ($options['currency'] ?? 'IRT');
        $multiplier = (float) ($options['price_multiplier'] ?? 1);

        return $this->mapper->toMinor(
            [$key => abs((float) $record[$key])],
            $key,
            $currency,
            $multiplier > 0 ? $multiplier : 1
        );
    }

    private function walletReason(string $raw): string
    {
        $key = strtolower(trim($raw));
        $known = ['topup', 'checkout', 'checkout_restore', 'withdraw_request', 'withdraw_rejected', 'order_refund', 'admin_adjust'];

        return in_array($key, $known, true) ? $key : 'admin_adjust';
    }

    private function localId(int $tenantId, string $resource, string $externalId, string $model): ?int
    {
        $externalId = trim($externalId);
        if ($externalId === '' || $externalId === '0') {
            return null;
        }
        $link = WordpressImportLink::query()
            ->where('tenant_id', $tenantId)
            ->where('resource', $resource)
            ->where('external_id', $externalId)
            ->first();
        if (! $link) {
            return null;
        }
        $exists = $model::query()->where('tenant_id', $tenantId)->whereKey($link->local_id)->exists();

        return $exists ? (int) $link->local_id : null;
    }

    private function linkedId(int $tenantId, string $resource, string $externalId): ?int
    {
        $link = WordpressImportLink::query()
            ->where('tenant_id', $tenantId)
            ->where('resource', $resource)
            ->where('external_id', $externalId)
            ->first();

        return $link ? (int) $link->local_id : null;
    }

    private function link(int $tenantId, string $resource, string $externalId, string $localType, int $localId): void
    {
        WordpressImportLink::query()->updateOrCreate(
            [
                'tenant_id' => $tenantId,
                'resource' => mb_substr($resource, 0, 32),
                'external_id' => mb_substr($externalId, 0, 191),
            ],
            [
                'local_type' => mb_substr($localType, 0, 80),
                'local_id' => $localId,
            ]
        );
    }

    private function touchSummary(WordpressImportQueue $row, string $status): void
    {
        if (! $row->job_id) {
            return;
        }
        $job = WordpressImportJob::query()->find($row->job_id);
        if (! $job) {
            return;
        }
        $summary = is_array($job->summary) ? $job->summary : [];
        $list = is_array($summary['needs_mapping'] ?? null) ? $summary['needs_mapping'] : [];
        $key = $row->resource.':'.$row->external_id;
        if (isset($list[$key]) && is_array($list[$key])) {
            $list[$key]['status'] = $status;
            $summary['needs_mapping'] = $list;
            $job->summary = $summary;
            $job->save();
        }
    }

    private function text(mixed $value, int $max): ?string
    {
        if (! is_scalar($value)) {
            return null;
        }
        $text = trim((string) $value);

        return $text === '' ? null : mb_substr($text, 0, $max);
    }

    /**
     * @return array{applied: bool, message: string, local_type: ?string, local_id: ?int}
     */
    private function result(bool $applied, string $message, ?string $localType, ?int $localId): array
    {
        return [
            'applied' => $applied,
            'message' => $message,
            'local_type' => $localType,
            'local_id' => $localId,
        ];
    }
}
