<?php

namespace App\Services\AiContent;

use Illuminate\Support\Facades\Http;

final class AiProviders
{
    /**
     * @param  array<string, mixed>  $schema
     * @param  array<string, mixed>  $extra
     * @return array{ok: bool, content?: string, data?: array, provider?: string, model?: string, tokens_in?: int, tokens_out?: int, error?: string}
     */
    public function complete(int $tenantId, string $system, string $user, array $schema = [], ?string $forceProvider = null, array $extra = []): array
    {
        if ($schema !== []) {
            $system .= "\n\nReturn ONLY valid JSON matching this shape (no markdown):\n"
                .json_encode($schema, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        }

        return $this->dispatch($tenantId, $system, $user, $forceProvider, $extra, true);
    }

    /**
     * @param  array<string, mixed>  $extra
     * @return array{ok: bool, content?: string, provider?: string, model?: string, tokens_in?: int, tokens_out?: int, error?: string}
     */
    public function completeText(int $tenantId, string $system, string $user, array $extra = []): array
    {
        return $this->dispatch($tenantId, $system, $user, $extra['force_provider'] ?? null, $extra, false);
    }

    /**
     * @param  array<string, mixed>  $extra
     * @return array{ok: bool, content?: string, data?: array, provider?: string, model?: string, tokens_in?: int, tokens_out?: int, error?: string}
     */
    private function dispatch(int $tenantId, string $system, string $user, ?string $forceProvider, array $extra, bool $parseJson): array
    {
        $settings = AiContentSettings::get($tenantId);
        $order = is_array($settings['fallback_order'] ?? null)
            ? $settings['fallback_order']
            : ['grok', 'gemini', 'openai', 'gapgpt'];
        if ($forceProvider) {
            $order = [strtolower($forceProvider)];
        } else {
            $default = strtolower((string) ($settings['default_provider'] ?? 'grok'));
            $order = array_values(array_unique(array_merge([$default], $order)));
        }

        $lastError = 'No provider available';
        foreach ($order as $provider) {
            $key = $this->keyFor((string) $provider, $settings);
            if ($key === '') {
                continue;
            }
            $result = $this->callProvider((string) $provider, $key, $settings, $system, $user, $extra);
            $result['provider'] = $provider;
            if (empty($result['model'])) {
                $result['model'] = (string) ($settings[$provider.'_model'] ?? '');
            }
            if (! empty($result['ok'])) {
                if (! $parseJson) {
                    return $result;
                }
                $parsed = $this->parseJson((string) ($result['content'] ?? ''));
                if ($parsed === null) {
                    $result['ok'] = false;
                    $result['error'] = 'Invalid JSON from provider';

                    return $result;
                }
                $result['data'] = $parsed;

                return $result;
            }
            $lastError = (string) ($result['error'] ?? 'Provider failed');
            $code = (int) ($result['http_code'] ?? 0);
            if (! $this->isRetryable($lastError, $code)) {
                return $result;
            }
        }

        return ['ok' => false, 'error' => $lastError];
    }

    /** @param  array<string, mixed>  $settings */
    private function keyFor(string $provider, array $settings): string
    {
        $map = [
            'grok' => 'grok_api_key', 'gemini' => 'gemini_api_key',
            'openai' => 'openai_api_key', 'gapgpt' => 'gapgpt_api_key',
        ];

        return trim((string) ($settings[$map[$provider] ?? ''] ?? ''));
    }

    /**
     * @param  array<string, mixed>  $settings
     * @param  array<string, mixed>  $extra
     * @return array{ok: bool, content?: string, tokens_in?: int, tokens_out?: int, error?: string, http_code?: int, model?: string}
     */
    private function callProvider(string $provider, string $apiKey, array $settings, string $system, string $user, array $extra): array
    {
        $forced = trim((string) ($extra['force_model'] ?? ''));
        $temp = (float) ($settings['temperature'] ?? 0.55);
        $max = (int) ($extra['max_tokens'] ?? ($settings['max_tokens'] ?? 4096));

        return match ($provider) {
            'gemini' => $this->callGemini($apiKey, $forced ?: (string) $settings['gemini_model'], $system, $user, $temp, $max),
            'openai' => $this->callOpenAiCompat(
                'https://api.openai.com/v1/chat/completions',
                $apiKey,
                $forced ?: (string) $settings['openai_model'],
                $system,
                $user,
                $temp,
                $max
            ),
            'gapgpt' => $this->callOpenAiCompat(
                'https://api.gapgpt.app/v1/chat/completions',
                $apiKey,
                $forced ?: (string) $settings['gapgpt_model'],
                $system,
                $user,
                $temp,
                $max
            ),
            'grok' => $this->callOpenAiCompat(
                'https://api.x.ai/v1/chat/completions',
                $apiKey,
                $forced ?: (string) $settings['grok_model'],
                $system,
                $user,
                $temp,
                $max
            ),
            default => ['ok' => false, 'error' => 'Unknown provider'],
        };
    }

    /** @return array{ok: bool, content?: string, tokens_in?: int, tokens_out?: int, error?: string, http_code?: int, model?: string} */
    private function callOpenAiCompat(string $url, string $apiKey, string $model, string $system, string $user, float $temp, int $max): array
    {
        try {
            $res = Http::withToken($apiKey)
                ->timeout(120)
                ->acceptJson()
                ->post($url, [
                    'model' => $model,
                    'temperature' => $temp,
                    'max_tokens' => max(256, $max),
                    'messages' => [
                        ['role' => 'system', 'content' => $system],
                        ['role' => 'user', 'content' => $user],
                    ],
                ]);
            $code = $res->status();
            if (! $res->successful()) {
                return ['ok' => false, 'error' => 'HTTP '.$code.': '.mb_substr($res->body(), 0, 300), 'http_code' => $code, 'model' => $model];
            }
            $json = $res->json();
            $content = (string) data_get($json, 'choices.0.message.content', '');

            return [
                'ok' => $content !== '',
                'content' => $content,
                'tokens_in' => (int) data_get($json, 'usage.prompt_tokens', 0),
                'tokens_out' => (int) data_get($json, 'usage.completion_tokens', 0),
                'model' => $model,
                'http_code' => $code,
                'error' => $content === '' ? 'Empty response' : null,
            ];
        } catch (\Throwable $e) {
            return ['ok' => false, 'error' => $e->getMessage(), 'model' => $model];
        }
    }

    /** @return array{ok: bool, content?: string, tokens_in?: int, tokens_out?: int, error?: string, http_code?: int, model?: string} */
    private function callGemini(string $apiKey, string $model, string $system, string $user, float $temp, int $max): array
    {
        $url = 'https://generativelanguage.googleapis.com/v1beta/models/'.rawurlencode($model).':generateContent?key='.urlencode($apiKey);
        try {
            $res = Http::timeout(120)->acceptJson()->post($url, [
                'systemInstruction' => ['parts' => [['text' => $system]]],
                'contents' => [['role' => 'user', 'parts' => [['text' => $user]]]],
                'generationConfig' => [
                    'temperature' => $temp,
                    'maxOutputTokens' => max(256, $max),
                ],
            ]);
            $code = $res->status();
            if (! $res->successful()) {
                return ['ok' => false, 'error' => 'HTTP '.$code.': '.mb_substr($res->body(), 0, 300), 'http_code' => $code, 'model' => $model];
            }
            $json = $res->json();
            $content = (string) data_get($json, 'candidates.0.content.parts.0.text', '');

            return [
                'ok' => $content !== '',
                'content' => $content,
                'tokens_in' => (int) data_get($json, 'usageMetadata.promptTokenCount', 0),
                'tokens_out' => (int) data_get($json, 'usageMetadata.candidatesTokenCount', 0),
                'model' => $model,
                'http_code' => $code,
                'error' => $content === '' ? 'Empty response' : null,
            ];
        } catch (\Throwable $e) {
            return ['ok' => false, 'error' => $e->getMessage(), 'model' => $model];
        }
    }

    /** @return array<string, mixed>|null */
    private function parseJson(string $content): ?array
    {
        $content = trim($content);
        if (preg_match('/```(?:json)?\s*([\s\S]*?)```/', $content, $m)) {
            $content = trim($m[1]);
        }
        $decoded = json_decode($content, true);
        if (is_array($decoded)) {
            return $decoded;
        }
        $start = strpos($content, '{');
        $end = strrpos($content, '}');
        if ($start !== false && $end !== false && $end > $start) {
            $decoded = json_decode(substr($content, $start, $end - $start + 1), true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }

        return null;
    }

    private function isRetryable(string $error, int $code): bool
    {
        if (in_array($code, [429, 500, 502, 503, 504], true)) {
            return true;
        }

        return (bool) preg_match('/timeout|rate.?limit|temporar|unavailable|overload/i', $error);
    }

    public function estimateCostToman(int $tenantId, int $tokensIn, int $tokensOut): float
    {
        $rate = (float) (AiContentSettings::get($tenantId)['usd_to_toman'] ?? 100000);
        // Rough $0.5 / 1M in + $1.5 / 1M out
        $usd = ($tokensIn / 1_000_000) * 0.5 + ($tokensOut / 1_000_000) * 1.5;

        return round($usd * $rate, 4);
    }

    /** @return list<array{id: string, name: string}> */
    public function gapgptModels(int $tenantId): array
    {
        $key = trim((string) (AiContentSettings::get($tenantId)['gapgpt_api_key'] ?? ''));
        if ($key === '') {
            return [];
        }
        try {
            $res = Http::withToken($key)->timeout(30)->get('https://api.gapgpt.app/v1/models');
            if (! $res->successful()) {
                return [];
            }
            $data = $res->json('data');
            if (! is_array($data)) {
                return [];
            }

            return array_values(array_filter(array_map(function ($row) {
                if (! is_array($row)) {
                    return null;
                }
                $id = (string) ($row['id'] ?? '');

                return $id === '' ? null : ['id' => $id, 'name' => (string) ($row['name'] ?? $id)];
            }, $data)));
        } catch (\Throwable) {
            return [];
        }
    }
}
