<?php

namespace App\Services\Marketplace\Basalam;

use App\Services\Marketplace\MarketplaceException;
use App\Services\Marketplace\MarketplaceLogger;

/**
 * Basalam wallet: balance, active / historical settlements, bank accounts and settlement requests
 * (port of FinancialManagementService). Each read returns {success, status_code, message, data}.
 */
class BasalamFinance
{
    public const ACTIVE_STATUS_FILTER_TYPE = 2;

    public const ACTIVE_STATUSES = [4, 6, 8, 9, 10];

    public function __construct(protected BasalamClient $client) {}

    public static function for(int $tenantId): self
    {
        return new self(BasalamClient::for($tenantId));
    }

    /** Settlement list URL; `status` is repeated per value, which Basalam requires. */
    public static function settlementsUrl(int $page, int $perPage, bool $active): string
    {
        $params = ['page' => max(1, $page), 'per_page' => max(1, $perPage)];
        if ($active) {
            $params['status_filter_type'] = self::ACTIVE_STATUS_FILTER_TYPE;
        }
        $query = http_build_query($params, '', '&', PHP_QUERY_RFC3986);
        if ($active) {
            foreach (self::ACTIVE_STATUSES as $status) {
                $query .= '&status='.$status;
            }
        }

        return BasalamEndpoints::FINANCE_SETTLEMENTS.'?'.$query;
    }

    /** @return array{success: bool, status_code: int, message: string, data: array<mixed>} */
    protected function wrap(callable $fn): array
    {
        try {
            $data = $fn();

            return ['success' => true, 'status_code' => $this->client->lastStatus ?: 200, 'message' => '', 'data' => $data];
        } catch (MarketplaceException $e) {
            return ['success' => false, 'status_code' => $e->status, 'message' => $e->getMessage(), 'data' => $e->response];
        }
    }

    public function balance(): array
    {
        return $this->wrap(fn () => $this->client->get(BasalamEndpoints::FINANCE_BALANCE));
    }

    public function activeSettlements(int $page = 1, int $perPage = 20): array
    {
        return $this->wrap(fn () => $this->client->get(self::settlementsUrl($page, $perPage, true)));
    }

    public function history(int $page = 1, int $perPage = 20): array
    {
        return $this->wrap(fn () => $this->client->get(self::settlementsUrl($page, $perPage, false)));
    }

    public function banks(): array
    {
        return $this->wrap(fn () => $this->client->get(BasalamEndpoints::BANK_ACCOUNTS));
    }

    /** @return array{balance: array<mixed>, settlements: array<mixed>, history: array<mixed>} */
    public function overview(int $page = 1, int $perPage = 10): array
    {
        return [
            'balance' => $this->balance(),
            'settlements' => $this->activeSettlements(1, 10),
            'history' => $this->history($page, $perPage),
        ];
    }

    /** @return array<mixed> */
    public function createSettlement(int $amount, int $method, ?int $investmentOptionId = null, ?int $bankAccountId = null): array
    {
        if ($amount < 1 || $method < 1) {
            throw new MarketplaceException(__('marketplace.basalam_settlement_invalid'), 422);
        }
        $body = ['amount' => $amount, 'method' => $method];
        if ($investmentOptionId !== null) {
            $body['investment_option_id'] = $investmentOptionId;
        }
        if ($bankAccountId !== null) {
            $body['bank_account_id'] = $bankAccountId;
        }
        $result = $this->client->post(BasalamEndpoints::FINANCE_SETTLEMENT_CREATE, $body);
        MarketplaceLogger::info($this->client->tenantId(), 'basalam', 'finance', 'Settlement requested', ['amount' => $amount, 'method' => $method]);

        return $result;
    }
}
