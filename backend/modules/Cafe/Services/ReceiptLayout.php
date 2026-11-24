<?php

namespace Modules\Cafe\Services;

use App\Services\Modules\ModuleSettingsService;

/**
 * What a receipt carries, per tenant.
 *
 * A receipt is a legal document and a piece of branding at once, and shops disagree about both:
 * one needs the VAT number and the branch address, another wants a QR code to the menu, a third
 * refuses to print prices on the kitchen copy. Storing the choices beats hard-coding one shop's
 * taste into a blade template.
 *
 * Every value here has a shipped default, so a tenant that never opens the screen still prints
 * a correct, legal receipt rather than a blank page.
 */
final class ReceiptLayout
{
    public const MODULE = 'cafe';

    public const SUBMODULE = 'receipt';

    public function __construct(private readonly ModuleSettingsService $settings) {}

    /**
     * The knobs. Order matters: this array is what the settings screen renders, top to bottom.
     *
     * @return array<string, mixed>
     */
    public static function defaults(): array
    {
        return [
            'header_title' => null,
            'footer_note' => null,
            'show_logo' => true,
            'show_branch_address' => true,
            'show_branch_phone' => true,
            'show_customer' => true,
            'show_cashier' => true,
            'show_table' => true,
            'show_tax_number' => true,
            'show_item_notes' => true,
            'show_qr' => true,
            'qr_caption' => null,
            'paper_width_mm' => 80,
            'copies' => 1,
            // The kitchen copy omits prices: a cook has no business seeing the margin.
            'kitchen_hides_prices' => true,
        ];
    }

    /** @return array<string, mixed> */
    public function get(int $tenantId): array
    {
        $stored = $this->settings->get($tenantId, self::MODULE, self::SUBMODULE, self::defaults());

        return array_merge(self::defaults(), is_array($stored) ? $stored : []);
    }

    /** @param  array<string, mixed>  $payload */
    public function put(int $tenantId, array $payload): array
    {
        // Only known keys are stored: an unknown key would be silently ignored at print time,
        // which is how a tenant ends up insisting they enabled something they did not.
        $known = array_intersect_key($payload, self::defaults());

        return $this->settings->put(
            $tenantId,
            self::MODULE,
            self::SUBMODULE,
            array_merge($this->get($tenantId), $known),
        );
    }

    /**
     * Turn a paid order into the fields a receipt template needs.
     *
     * Kept next to the layout so the template never has to know whether a branch address is
     * "shown" — it is either in the payload or it is not.
     *
     * @param  array<string, mixed>  $order
     * @return array<string, mixed>
     */
    public function render(int $tenantId, array $order): array
    {
        $layout = $this->get($tenantId);

        return [
            'layout' => $layout,
            'header' => [
                'title' => $layout['header_title'],
                'logo' => (bool) $layout['show_logo'],
            ],
            'branch' => [
                'address' => $layout['show_branch_address'] ? ($order['branch_address'] ?? null) : null,
                'phone' => $layout['show_branch_phone'] ? ($order['branch_phone'] ?? null) : null,
            ],
            'footer' => $layout['footer_note'],
            'qr' => (bool) $layout['show_qr'] ? ($order['qr_url'] ?? null) : null,
            'qr_caption' => $layout['qr_caption'],
            'paper_width_mm' => (int) $layout['paper_width_mm'],
            'copies' => max(1, (int) $layout['copies']),
        ];
    }
}
