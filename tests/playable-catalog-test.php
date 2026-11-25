<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/catalog-sources.php';
function checkPlayable(bool $ok,string $message): void {
    if (!$ok) throw new RuntimeException($message);
}
$query=['miyagi'];
$record='<div class="track-item js-item" data-title="На дне" data-artist="Miyagi" data-track="https://s.muzrecord.com/mp3/public_files/2026-11/miyagi-na-dne.mp3"></div>';
$r=dagPlayableParseHtml($record,'muzrecord',$query);
checkPlayable(count($r)===1 && $r[0]['source']==='[MUZRECORD]','MuzRecord playable parser');
checkPlayable(str_starts_with($r[0]['url'],'https://s.muzrecord.com/'),'MuzRecord media host');
$pace='<div class="track-row" data-url="https://cdn.muzpace.net/dll/islam_itlyashev_aziya_128.mp3" data-artist="Ислам Итляшев" data-title="Азия"></div>';
$r=dagPlayableParseHtml($pace,'muzpace',['ислам','итляшев']);
checkPlayable(count($r)===1 && $r[0]['source']==='[MUZPACE]','MuzPace playable parser');
$hitmos='{"id":12650595,"title":"Miyagi","artist":"Vera Haji","duration":386,"play":"https://plc1.hitmos.fm/L21wMy81NjA4Mjg3L3RyYWNrLm1wMw==.mp3"}';
$r=dagPlayableParseHtml('<script>'.str_replace('"','\\"',$hitmos).'</script>','hitmos',$query);
checkPlayable(count($r)===1 && $r[0]['source']==='[HITMOS]','Hitmos serialized playback parser');
checkPlayable(dagPlayableAudioUrl('http://s.muzrecord.com/mp3/file.mp3','muzrecord')==='','HTTP bypass');
checkPlayable(dagPlayableAudioUrl('https://s.muzrecord.com.evil.net/mp3/file.mp3','muzrecord')==='','host suffix injection');
checkPlayable(dagPlayableAudioUrl('https://cdn.muzpace.net/notdll/audio.mp3','muzpace')==='','invalid playlist path');
checkPlayable(dagPlayableAudioUrl('https://plc1.hitmos.fm:8080/audio.mp3','hitmos')==='','nonstandard port');
checkPlayable(dagPlayableAudioUrl('https://private-host.test/track.mp3','hitmos')==='','arbitrary domain');
checkPlayable(dagPlayableMake('Miyagi','Artist','https://example.com/a.mp3','muzrecord',$query)===null,'unapproved audio becomes track');
echo "ALL_THREE_AUDIO_PARSERS_AND_STRICT_HOST_CHECKS_OK\n";
