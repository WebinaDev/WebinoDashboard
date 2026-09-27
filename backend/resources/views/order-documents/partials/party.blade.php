@if ($party === 'seller')
<td>
    <strong>{{ $doc->t('seller') }}:</strong> {{ $s['sender_name'] }}
    @if ($s['sender_address'] !== '')<br><strong>{{ $doc->t('address') }}:</strong> {{ $s['sender_address'] }}@endif
    @if ($s['sender_postcode'] !== '')<br><strong>{{ $doc->t('postcode') }}:</strong> {{ $doc->n($s['sender_postcode']) }}@endif
    @if ($s['sender_phone'] !== '')<br><strong>{{ $doc->t('phone') }}:</strong> {{ $doc->n($s['sender_phone']) }}@endif
    @if ($s['sender_email'] !== '')<br><strong>{{ $doc->t('email') }}:</strong> {{ $s['sender_email'] }}@endif
</td>
@else
<td>
    {{ $doc->t('buyer') }}: {{ $ship['name'] }}<br>
    @if ($ship['state_label'] !== '' || $ship['city'] !== '' || $ship['postcode'] !== '')
        {{ $doc->t('state_city_postcode', ['state' => $ship['state_label'], 'city' => $ship['city'], 'postcode' => $doc->n($ship['postcode'])]) }}<br>
    @endif
    {{ $doc->t('address') }}: {{ $ship['address'] }}
    @if ($ship['phone'] !== '')<br>{{ $doc->t('phone') }}: {{ $doc->n($ship['phone']) }}@endif
</td>
@endif
