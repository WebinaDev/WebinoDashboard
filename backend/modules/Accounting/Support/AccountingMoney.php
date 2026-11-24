<?php

namespace Modules\Accounting\Support;

use App\Support\Currency;
use Modules\Accounting\Entities\AccountingSetting;

/**
 * Money settings for the accounting module.
 *
 * The ERP reads and writes its currency preferences through `App\Support\Money`,
 * which is bound to Core's global `system_settings` table. This codebase has
 * {@see Currency} for the arithmetic but no global settings table, and amounts here
 * are stored in minor units on a per-tenant basis (see `accounting_*` tables).
 *
 * Only the two static entry points the ERP controllers actually call are provided —
 * `settingsPayload()` and `saveSettings()`. Both persist through
 * {@see AccountingSetting}, which is tenant-scoped, so two shops can run different
 * display currencies without seeing each other's defaults.
 *
 * Deliberately *not* ported: `Money::toRial()`, `Money::formatRial()` and the FX
 * helpers. The ERP stores money in integer rials; this dashboard stores it in minor
 * units with its own {@see Currency} conversion, and duplicating that arithmetic in a
 * second class is how rounding bugs start.
 */
final class AccountingMoney
{
    public const SETTING_DISPLAY = 'display_currency';

    public const SETTING_SYMBOL = 'display_currency_symbol';

    public const SETTING_ACCOUNTING = 'accounting_currency';

    public const SETTING_ACCOUNTING_SYMBOL = 'accounting_currency_symbol';

    public const SETTING_DECIMALS = 'display_currency_decimals';

    public const SETTING_THOUSAND_SEP = 'display_thousand_separator';

    public const SETTING_DECIMAL_SEP = 'display_decimal_separator';

    /** The configured display unit (IRT by default). */
    public static function displayCurrency(): string
    {
        $raw = AccountingSetting::get(self::SETTING_DISPLAY);

        if ($raw === null || $raw === '') {
            $raw = AccountingSetting::get(self::SETTING_ACCOUNTING, 'IRT');
        }

        $code = Currency::normalize(is_string($raw) ? $raw : 'IRT', 'IRT');

        return in_array($code, Currency::DISPLAY_CODES, true) ? $code : 'IRT';
    }

    public static function displaySymbol(): string
    {
        $currency = self::displayCurrency();
        $raw = AccountingSetting::get(self::SETTING_SYMBOL);

        if ($raw === null || $raw === '') {
            $raw = AccountingSetting::get(self::SETTING_ACCOUNTING_SYMBOL, 'default');
        }

        return self::normalizeSymbol($currency, is_string($raw) ? $raw : null);
    }

    /**
     * Map a stored symbol token to the one the UI renders, per currency.
     *
     * The token is a UI choice ("default", "toman-1", …), not the glyph itself, so an
     * invalid or foreign value falls back rather than being echoed into the page.
     */
    public static function normalizeSymbol(string $currency, ?string $symbol): string
    {
        $currency = Currency::normalize($currency, 'IRT');
        $symbol = trim((string) $symbol);

        if (Currency::isForeign($currency)) {
            return Currency::symbol($currency);
        }

        $allowed = match ($currency) {
            'IRR' => ['rial-1', 'rial-2'],
            'IRHT' => ['default', 'toman-1', 'toman-2'],
            default => ['default', 'toman-1', 'toman-2'],
        };

        if (in_array($symbol, $allowed, true)) {
            return $symbol;
        }

        return $currency === 'IRR' ? 'rial-1' : 'toman-1';
    }

    /**
     * Persist display (+ mirrored accounting) currency settings.
     *
     * @param  array{currency?:string|null,currency_symbol?:string|null,decimals?:int|null,thousand_separator?:string|null,decimal_separator?:string|null}  $input
     * @return array<string, mixed>
     */
    public static function saveSettings(array $input): array
    {
        $hasCurrency = array_key_exists('currency', $input) && $input['currency'] !== null && $input['currency'] !== '';
        $currency = $hasCurrency
            ? Currency::normalize((string) $input['currency'], 'IRT')
            : self::displayCurrency();

        if (! in_array($currency, Currency::DISPLAY_CODES, true)) {
            $currency = 'IRT';
        }

        if ($hasCurrency) {
            AccountingSetting::set(self::SETTING_DISPLAY, $currency, 'pricing');
            AccountingSetting::set(
                self::SETTING_ACCOUNTING,
                in_array($currency, ['IRR', 'IRT'], true) ? $currency : 'IRT',
                'accounting',
            );
        }

        $hasSymbol = array_key_exists('currency_symbol', $input) && $input['currency_symbol'] !== null && $input['currency_symbol'] !== '';

        if ($hasSymbol || $hasCurrency) {
            $symbol = self::normalizeSymbol(
                $currency,
                $hasSymbol ? (string) $input['currency_symbol'] : self::displaySymbol(),
            );
            AccountingSetting::set(self::SETTING_SYMBOL, $symbol, 'pricing');
            AccountingSetting::set(self::SETTING_ACCOUNTING_SYMBOL, $symbol, 'accounting');
        }

        if (array_key_exists('decimals', $input) && $input['decimals'] !== null && $input['decimals'] !== '') {
            AccountingSetting::set(self::SETTING_DECIMALS, (string) max(0, min(4, (int) $input['decimals'])), 'pricing');
        }

        if (array_key_exists('thousand_separator', $input) && $input['thousand_separator'] !== null) {
            AccountingSetting::set(self::SETTING_THOUSAND_SEP, mb_substr((string) $input['thousand_separator'], 0, 2), 'pricing');
        }

        if (array_key_exists('decimal_separator', $input) && $input['decimal_separator'] !== null) {
            AccountingSetting::set(self::SETTING_DECIMAL_SEP, mb_substr((string) $input['decimal_separator'], 0, 2), 'pricing');
        }

        return self::settingsPayload();
    }

    /** @return array<string, mixed> */
    public static function settingsPayload(): array
    {
        $currency = self::displayCurrency();
        $decimals = (int) (AccountingSetting::get(
            self::SETTING_DECIMALS,
            (string) Currency::decimals($currency),
        ) ?? Currency::decimals($currency));

        return [
            'currency' => $currency,
            'currency_symbol' => self::displaySymbol(),
            'label_fa' => Currency::label($currency, 'fa'),
            'label_en' => Currency::label($currency, 'en'),
            'base' => Currency::BASE,
            'settlement' => Currency::SETTLEMENT,
            'decimals' => $decimals,
            'thousand_separator' => (string) (AccountingSetting::get(self::SETTING_THOUSAND_SEP, ',') ?? ','),
            'decimal_separator' => (string) (AccountingSetting::get(self::SETTING_DECIMAL_SEP, '.') ?? '.'),
            'allowed' => Currency::DISPLAY_CODES,
        ];
    }
}
