<?php

namespace App\Services\Bots\Engine;

/**
 * Mandatory / optional channel membership gate before bot use.
 */
final class ForceJoinGate extends BotFlow
{
    /** @return array{enabled: bool, mode: string, channel_id: string, channel_link: string, message: string, check_btn: string} */
    public static function config(BotContext $ctx): array
    {
        $meta = $ctx->meta();
        $fj = is_array($meta['force_join'] ?? null) ? $meta['force_join'] : [];
        $enabled = ! empty($fj['enabled']) || $ctx->addon('force_join');
        $mode = ($fj['mode'] ?? 'mandatory') === 'optional' ? 'optional' : 'mandatory';

        return [
            'enabled' => $enabled,
            'mode' => $mode,
            'channel_id' => trim((string) ($fj['channel_id'] ?? '')),
            'channel_link' => trim((string) ($fj['channel_link'] ?? '')),
            'message' => trim((string) ($fj['message'] ?? '')) ?: 'برای استفاده از ربات، ابتدا در کانال عضو شوید.',
            'check_btn' => trim((string) ($fj['check_button_text'] ?? '')) ?: '✅ عضو شدم — بررسی',
        ];
    }

    /** Returns true when the update may proceed. */
    public function allow(?string $callbackData = null): bool
    {
        $cfg = self::config($this->ctx);
        if (! $cfg['enabled'] || $cfg['channel_id'] === '') {
            return true;
        }
        if ($this->ctx->isAdmin()) {
            return true;
        }

        $sessionMeta = is_array($this->ctx->session->meta) ? $this->ctx->session->meta : [];
        if (! empty($sessionMeta['force_join_ok'])) {
            return true;
        }
        if ($cfg['mode'] === 'optional' && ! empty($sessionMeta['force_join_skipped'])) {
            return true;
        }

        if ($callbackData === 'fj:check' || $callbackData === 'fj:skip') {
            if ($callbackData === 'fj:skip' && $cfg['mode'] === 'optional') {
                $sessionMeta['force_join_skipped'] = true;
                $this->ctx->session->meta = $sessionMeta;
                $this->ctx->session->save();

                return true;
            }
            if ($this->isMember($cfg['channel_id'])) {
                $sessionMeta['force_join_ok'] = true;
                $this->ctx->session->meta = $sessionMeta;
                $this->ctx->session->save();
                // Welcome / menu is sent by BotEngine after fj:check clears the gate.

                return true;
            }
            $this->prompt($cfg, true);

            return false;
        }

        if ($this->isMember($cfg['channel_id'])) {
            $sessionMeta['force_join_ok'] = true;
            $this->ctx->session->meta = $sessionMeta;
            $this->ctx->session->save();

            return true;
        }

        $this->prompt($cfg, false);

        return false;
    }

    /** @param  array{channel_id: string, channel_link: string, message: string, check_btn: string, mode: string}  $cfg */
    private function prompt(array $cfg, bool $failedCheck): void
    {
        $rows = [];
        if ($cfg['channel_link'] !== '') {
            $rows[] = [['text' => '📣 عضویت در کانال', 'url' => $cfg['channel_link']]];
        }
        $rows[] = [['text' => $cfg['check_btn'], 'callback_data' => 'fj:check']];
        if ($cfg['mode'] === 'optional') {
            $rows[] = [['text' => '⏭ فعلاً رد شو', 'callback_data' => 'fj:skip']];
        }
        $text = ($failedCheck ? 'هنوز عضو کانال نیستید.'."\n\n" : '').$cfg['message'];
        $this->send($text, $rows);
    }

    private function isMember(string $channelId): bool
    {
        if (! $this->ctx->client) {
            return false;
        }
        $res = $this->ctx->client->call('getChatMember', [
            'chat_id' => $channelId,
            'user_id' => (int) ($this->ctx->from['id'] ?? $this->ctx->chatId),
        ]);
        if (empty($res['ok'])) {
            return false;
        }
        $status = (string) data_get($res, 'body.result.status', '');

        return in_array($status, ['creator', 'administrator', 'member', 'restricted'], true);
    }
}
