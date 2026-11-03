<?php

namespace App\Services\Bots\Engine;

use App\Models\BotSetting;
use App\Services\Bots\BotClientFactory;

/**
 * Syncs the platform chat menu button with the configured Mini App / WebApp URL.
 */
final class WebAppManager
{
    public static function resolveUrl(BotSetting $setting): string
    {
        $meta = is_array($setting->meta) ? $setting->meta : [];
        if (empty($meta['addons']['webapp'])) {
            return '';
        }
        $url = trim((string) (
            ($meta['widget']['webapp_url'] ?? null)
            ?: ($meta['club']['webapp_base_url'] ?? null)
            ?: ($meta['referral']['webapp_base_url'] ?? null)
            ?: ''
        ));

        return $url !== '' && str_starts_with($url, 'http') ? $url : '';
    }

    /** Push setChatMenuButton (web_app or default) for the bot. Best-effort. */
    public static function syncMenuButton(BotSetting $setting): bool
    {
        $client = BotClientFactory::forSetting($setting);
        if (! $client) {
            return false;
        }
        $url = self::resolveUrl($setting);
        $label = trim((string) (
            data_get($setting->meta, 'page_builder.labels.webapp')
            ?: (BotFlow::MENU['webapp'] ?? 'WebApp')
        ));
        if ($url !== '') {
            $res = $client->call('setChatMenuButton', [
                'menu_button' => [
                    'type' => 'web_app',
                    'text' => mb_substr($label, 0, 64),
                    'web_app' => ['url' => $url],
                ],
            ]);
        } else {
            $res = $client->call('setChatMenuButton', [
                'menu_button' => ['type' => 'commands'],
            ]);
        }

        return ! empty($res['ok']);
    }
}
