<?php
declare(strict_types=1);
require dirname(__DIR__).'/partner-config.php';
function checkPartner(bool $pass,string $label): void {
    if (!$pass) {fwrite(STDERR,"FAIL: $label\n");exit(1);}
}
putenv('DAG_PARTNER_SEARCH_API_URL=https://api.partner.example/search');
putenv('DAG_PARTNER_AUDIO_HOSTS=cdn.partner.example');
putenv('DAG_PARTNER_RIGHTS_CONFIRMED=0');
checkPartner(!dagPartnerConfig()['enabled'],'rights required');
putenv('DAG_PARTNER_RIGHTS_CONFIRMED=1');
$c=dagPartnerConfig();
checkPartner($c['enabled'] && $c['audio_hosts'] === ['cdn.partner.example'],'approved config');
$tracks=[
 ['title'=>'Песня 2026','artist'=>'Исполнитель',
  'audio_url'=>'https://cdn.partner.example/music/song.mp3','playable'=>true,'release_date'=>'2026-10-02'],
 ['title'=>'Preview','artist'=>'Исполнитель',
  'audio_url'=>'https://cdn.partner.example/music/preview.mp3','playable'=>false,'release_date'=>'2026-10-02'],
 ['title'=>'Host bypass','artist'=>'Исполнитель',
  'audio_url'=>'https://cdn.partner.example.evil.org/music.mp3','playable'=>true],
 ['title'=>'Old date','artist'=>'Исполнитель',
  'audio_url'=>'https://cdn.partner.example/music/old.mp3','playable'=>true,'release_date'=>'2025-11-23'],
 ['title'=>'Localhost','artist'=>'Исполнитель',
  'audio_url'=>'http://127.0.0.1/audio.mp3','playable'=>true]
];
$parsed=dagPartnerParse(json_encode(['tracks'=>$tracks],JSON_UNESCAPED_UNICODE),$c['audio_hosts']);
checkPartner(count($parsed)===2,'only permitted full HTTPS tracks');
checkPartner($parsed[0]['release_date']==='2026-10-02'&&$parsed[1]['release_date']==='2025-11-23','real release dates accepted');
putenv('DAG_PARTNER_SEARCH_API_URL=http://api.partner.example/search');
checkPartner(!dagPartnerConfig()['enabled'],'require HTTPS API');
putenv('DAG_PARTNER_SEARCH_API_URL=https://127.0.0.1/search');
checkPartner(!dagPartnerConfig()['enabled'],'reject private IP');
echo "LICENSED_PARTNER_API_RIGHTS_HOSTS_FULL_AUDIO_OK\n";
