<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use Illuminate\Support\Facades\Http;

/**
 * Mellat / Behpardakht PGW (bpm.shaparak.ir).
 * Official WSDL: https://bpm.shaparak.ir/pgwchannel/services/pgw?wsdl
 */
class MellatDriver implements GatewayDriverInterface
{
    use ChecksRequiredConfig;

    private const ENDPOINT = 'https://bpm.shaparak.ir/pgwchannel/services/pgw';

    public function code(): string
    {
        return 'mellat';
    }

    public function status(): string
    {
        return 'live';
    }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        if ($miss = $this->missingRequired($config, ['terminal_id', 'username', 'password'])) {
            return $miss;
        }
        $orderId = (string) ($meta['order_id'] ?? time());
        $params = [
            'terminalId' => (string) $config['terminal_id'],
            'userName' => (string) $config['username'],
            'userPassword' => (string) $config['password'],
            'orderId' => $orderId,
            'amount' => (string) $amountRial,
            'localDate' => date('Ymd'),
            'localTime' => date('His'),
            'additionalData' => mb_substr($description, 0, 100),
            'callBackUrl' => $callbackUrl,
            'payerId' => '0',
        ];
        $raw = $this->call('bpPayRequest', $params);
        // Response: "0,RefId" on success.
        $parts = array_map('trim', explode(',', $raw));
        if (($parts[0] ?? '') !== '0' || empty($parts[1])) {
            return ['ok' => false, 'message' => 'Mellat request failed: '.$raw];
        }
        $refId = $parts[1];

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => 'https://bpm.shaparak.ir/pgwchannel/startpay.mellat?RefId='.urlencode($refId),
            'authority' => $refId,
            'meta' => [
                'mellat_ref_id' => $refId,
                'mellat_order_id' => $orderId,
                'amount_rial' => $amountRial,
            ],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        $resCode = (string) ($callback['ResCode'] ?? $callback['resCode'] ?? '');
        $saleRef = (string) ($callback['SaleReferenceId'] ?? $callback['saleReferenceId'] ?? '');
        $refId = (string) ($callback['RefId'] ?? $callback['refId'] ?? $intentMeta['mellat_ref_id'] ?? '');
        $orderId = (string) ($callback['SaleOrderId'] ?? $callback['saleOrderId'] ?? $intentMeta['mellat_order_id'] ?? '');
        if ($resCode !== '0' || $saleRef === '' || $orderId === '') {
            return ['ok' => false, 'message' => 'پرداخت ملت ناموفق یا لغو شد.'];
        }
        $auth = [
            'terminalId' => (string) ($config['terminal_id'] ?? ''),
            'userName' => (string) ($config['username'] ?? ''),
            'userPassword' => (string) ($config['password'] ?? ''),
            'orderId' => $orderId,
            'saleOrderId' => $orderId,
            'saleReferenceId' => $saleRef,
        ];
        $verify = trim($this->call('bpVerifyRequest', $auth));
        if ($verify !== '0') {
            return ['ok' => false, 'message' => 'تأیید ملت ناموفق بود: '.$verify];
        }
        $settle = trim($this->call('bpSettleRequest', $auth));
        if ($settle !== '0' && $settle !== '45') {
            // 45 = already settled
            return ['ok' => false, 'message' => 'Settle ملت ناموفق بود: '.$settle];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => $saleRef,
            'meta' => [
                'ref_id' => $refId,
                'sale_reference_id' => $saleRef,
                'verify' => $verify,
                'settle' => $settle,
            ],
        ];
    }

    public function testConnection(array $config): array
    {
        return $this->missingRequired($config, ['terminal_id', 'username', 'password'])
            ?? ['ok' => true, 'message' => 'پیکربندی ملت کامل است.'];
    }

    /** @param  array<string, string>  $params */
    private function call(string $method, array $params): string
    {
        $inner = '';
        foreach ($params as $k => $v) {
            $inner .= '<'.$k.'>'.htmlspecialchars((string) $v, ENT_XML1).'</'.$k.'>';
        }
        $xml = <<<XML
<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:web="http://interfaces.core.sw.bps.com/">
  <soapenv:Header/>
  <soapenv:Body>
    <web:{$method}>
      {$inner}
    </web:{$method}>
  </soapenv:Body>
</soapenv:Envelope>
XML;
        $body = Http::timeout(40)
            ->withHeaders(['Content-Type' => 'text/xml; charset=utf-8'])
            ->withBody($xml, 'text/xml; charset=utf-8')
            ->post(self::ENDPOINT)
            ->body();
        if (preg_match('/<return[^>]*>([^<]*)<\/return>/i', $body, $m)) {
            return html_entity_decode(trim($m[1]), ENT_XML1);
        }

        return $body;
    }
}
