<?php

namespace App\Services\Marketplace\Basalam;

use App\Services\Marketplace\MarketplaceException;
use Illuminate\Support\Facades\Cache;

/**
 * Per-tenant circuit breaker for Basalam hosts (port of WebinoBasalam CircuitBreaker):
 * opens after 10 transient failures, half-opens after 60s with a single probe, and forgets
 * stale failures after 5 minutes of quiet.
 */
class BasalamCircuitBreaker
{
    public const CLOSED = 'closed';

    public const OPEN = 'open';

    public const HALF_OPEN = 'half_open';

    public function __construct(
        protected int $tenantId,
        protected int $failureThreshold = 10,
        protected int $recoveryTimeout = 60,
        protected int $closedResetInterval = 300,
    ) {}

    protected function key(): string
    {
        return 'marketplace:basalam:circuit:'.$this->tenantId;
    }

    /** @return array{state: string, failure_count: int, last_failure: ?int, probe_started_at: ?int} */
    public function snapshot(): array
    {
        $state = array_merge($this->defaultState(), (array) Cache::get($this->key(), []));
        $now = time();
        if ($state['state'] === self::CLOSED && $state['failure_count'] > 0 && $state['last_failure']
            && $now - $state['last_failure'] >= $this->closedResetInterval) {
            $state = $this->defaultState();
            $this->save($state);
        }
        if ($state['state'] === self::HALF_OPEN && $state['probe_started_at'] && $now - $state['probe_started_at'] >= $this->recoveryTimeout) {
            $state['probe_started_at'] = null;
            $this->save($state);
        }

        return $state;
    }

    /** @throws MarketplaceException when the circuit is open */
    public function assertAllowed(): void
    {
        $state = $this->snapshot();
        if ($state['state'] === self::CLOSED) {
            return;
        }
        if ($state['state'] === self::OPEN) {
            if ($state['last_failure'] && time() - $state['last_failure'] < $this->recoveryTimeout) {
                throw new MarketplaceException(__('marketplace.basalam_circuit_open'), 503, [], max(1, $this->recoveryTimeout - (time() - $state['last_failure'])));
            }
            $state['state'] = self::HALF_OPEN;
            $state['probe_started_at'] = null;
        }
        if ($state['probe_started_at']) {
            throw new MarketplaceException(__('marketplace.basalam_circuit_probing'), 503, [], 10);
        }
        $state['probe_started_at'] = time();
        $this->save($state);
    }

    public function recordSuccess(): void
    {
        $state = $this->snapshot();
        if ($state['state'] !== self::CLOSED || $state['failure_count'] > 0) {
            $this->save($this->defaultState());
        }
    }

    public function recordFailure(): void
    {
        $state = $this->snapshot();
        $state['failure_count']++;
        $state['last_failure'] = time();
        $state['probe_started_at'] = null;
        if ($state['state'] === self::HALF_OPEN || $state['failure_count'] >= $this->failureThreshold) {
            $state['state'] = self::OPEN;
        }
        $this->save($state);
    }

    public function reset(): void
    {
        $this->save($this->defaultState());
    }

    /** @param  array<string, mixed>  $state */
    protected function save(array $state): void
    {
        Cache::put($this->key(), $state, now()->addDay());
    }

    /** @return array{state: string, failure_count: int, last_failure: ?int, probe_started_at: ?int} */
    protected function defaultState(): array
    {
        return ['state' => self::CLOSED, 'failure_count' => 0, 'last_failure' => null, 'probe_started_at' => null];
    }
}
