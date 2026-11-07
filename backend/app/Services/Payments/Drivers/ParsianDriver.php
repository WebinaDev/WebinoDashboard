<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use Illuminate\Support\Facades\Http;

/**
 * Parsian (PEC) New IPG — Sale + Confirm SOAP services on pec.shaparak.ir.
 *
 * @see https://pec.shaparak.ir/NewIPGServices/Sale/SaleService.asmx
 */
class ParsianDriver implements GatewayDriverInterface
{
    use ChecksRequiredConfig;

    public function code(): string
    {
        return 'parsian';
    }

    public function status(): string
    {
        return 'live';
    }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        if ($miss = $this->missingRequired($config, ['login_account'])) {
            return $miss;
        }
        $orderId = (int) ($meta['order_id'] ?? time());
        $xml = $this->saleEnvelope((string) $config['login_account'], $amountRial, $orderId, $callbackUrl);
        $response = Http::timeout(40)
            ->withHeaders([
                'Content-Type' => 'text/xml; charset=utf-8',
                'SOAPAction' => 'https://pec.Shaparak.ir/NewIPGServices/Sale/SaleService/SalePaymentRequest',
            ])
            ->withBody($xml, 'text/xml; charset=utf-8')
            ->post('https://pec.shaparak.ir/NewIPGServices/Sale/SaleService.asmx')
            ->body();
        $status = $this->xmlInt($response, 'Status');
        $token = $this->xmlStr($response, 'Token');
        if ($status !== 0 || $token === '') {
            $msg = $this->xmlStr($response, 'Message') ?: $response;

            return ['ok' => false, 'message' => 'Parsian request failed: '.$msg];
        }

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => 'https://pec.shaparak.ir/NewIPG/?Token='.urlencode($token),
            'authority' => $token,
            'meta' => [
                'parsian_token' => $token,
                'parsian_order_id' => (string) $orderId,
                'amount_rial' => $amountRial,
            ],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        $status = (int) ($callback['status'] ?? $callback['Status'] ?? -1);
        $token = (string) ($callback['Token'] ?? $callback['token'] ?? $intentMeta['parsian_token'] ?? '');
        if ($status !== 0 || $token === '') {
            return ['ok' => false, 'message' => 'پرداخت پارسیان ناموفق یا لغو شد.'];
        }
        $xml = $this->confirmEnvelope((string) ($config['login_account'] ?? ''), $token);
        $response = Http::timeout(40)
            ->withHeaders([
                'Content-Type' => 'text/xml; charset=utf-8',
                'SOAPAction' => 'https://pec.Shaparak.ir/NewIPGServices/Confirm/ConfirmService/ConfirmPayment',
            ])
            ->withBody($xml, 'text/xml; charset=utf-8')
            ->post('https://pec.shaparak.ir/NewIPGServices/Confirm/ConfirmService.asmx')
            ->body();
        $confirmStatus = $this->xmlInt($response, 'Status');
        if ($confirmStatus !== 0) {
            return ['ok' => false, 'message' => 'تأیید پارسیان ناموفق بود.', 'meta' => ['raw' => $response]];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => $this->xmlStr($response, 'RRN') ?: $this->xmlStr($response, 'CardNumberMasked') ?: $token,
            'meta' => ['raw' => $response],
        ];
    }

    public function testConnection(array $config): array
    {
        return $this->missingRequired($config, ['login_account'])
            ?? ['ok' => true, 'message' => 'پیکربندی پارسیان کامل است.'];
    }

    private function saleEnvelope(string $login, int $amount, int $orderId, string $callback): string
    {
        $login = htmlspecialchars($login, ENT_XML1);
        $callback = htmlspecialchars($callback, ENT_XML1);

        return <<<XML
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <SalePaymentRequest xmlns="https://pec.Shaparak.ir/NewIPGServices/Sale/SaleService">
      <requestData>
        <LoginAccount>{$login}</LoginAccount>
        <Amount>{$amount}</Amount>
        <OrderId>{$orderId}</OrderId>
        <CallBackUrl>{$callback}</CallBackUrl>
      </requestData>
    </SalePaymentRequest>
  </soap:Body>
</soap:Envelope>
XML;
    }

    private function confirmEnvelope(string $login, string $token): string
    {
        $login = htmlspecialchars($login, ENT_XML1);
        $token = htmlspecialchars($token, ENT_XML1);

        return <<<XML
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ConfirmPayment xmlns="https://pec.Shaparak.ir/NewIPGServices/Confirm/ConfirmService">
      <requestData>
        <LoginAccount>{$login}</LoginAccount>
        <Token>{$token}</Token>
      </requestData>
    </ConfirmPayment>
  </soap:Body>
</soap:Envelope>
XML;
    }

    private function xmlInt(string $xml, string $tag): int
    {
        if (preg_match('/<'.$tag.'[^>]*>(-?\d+)<\/'.$tag.'>/i', $xml, $m)) {
            return (int) $m[1];
        }

        return -999;
    }

    private function xmlStr(string $xml, string $tag): string
    {
        if (preg_match('/<'.$tag.'[^>]*>([^<]*)<\/'.$tag.'>/i', $xml, $m)) {
            return html_entity_decode(trim($m[1]), ENT_XML1);
        }

        return '';
    }
}
