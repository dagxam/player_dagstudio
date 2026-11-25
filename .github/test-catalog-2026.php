<?php
declare(strict_types=1);
define('DAG_CATALOG_LIBRARY_ONLY', true);
require dirname(__DIR__) . '/catalog-2026.php';
function verify2026(bool $ok, string $label): void {
    if (!$ok) { fwrite(STDERR, "FAIL: $label\n"); exit(1); }
}
verify2026(dagCatalogIsSafeUrl('https://musicbrainz.org/ws/2/release/?fmt=json'), 'safe MB');
verify2026(!dagCatalogIsSafeUrl('https://127.0.0.1/ws/2/release/?fmt=json'), 'private IP');
verify2026(!dagCatalogIsSafeUrl('https://kavkazmusic.tv.evil.tld/category/trackcards/'), 'spoof host');
verify2026(!dagCatalogIsSafeUrl('http://kavkazmusic.tv/category/trackcards/'), 'HTTPS only');
verify2026(dagCatalogValidDate('2026-11-20'), 'release date');
verify2026(!dagCatalogValidDate('2026-02-30'), 'calendar day');
verify2026(!dagCatalogValidDate('2025-11-20'), 'not 2026');
$sample = ['releases'=>[
    ['id'=>'de3e4698-5a5b-4e5f-8a5f-1a14f2b4a6c1',
     'title'=>'Новая песня','date'=>'2026-10-02','country'=>'RU',
     'artist-credit'=>[['name'=>'Певица']],
     'text-representation'=>['language'=>'rus']],
    ['id'=>'4f759a2b-a07e-4a91-8f88-891d9c3018b8',
     'title'=>'Старый трек','date'=>'2023-12-01','country'=>'RU',
     'artist-credit'=>[['name'=>'Певица']]]
]];
$results=dagCatalogMusicBrainz($sample);
verify2026(count($results)===1 && $results[0]['release_date']==='2026-10-02', 'Russian catalog exact 2026');
verify2026($results[0]['playable']===false && $results[0]['audio_url']===null, 'metadata not audio');
$rss='<?xml version="1.0"?><rss><channel><item><title>Ислам Гуков. «Песня»</title><link>https://kavkazmusic.tv/new-song</link><pubDate>Tue, 17 Nov 2026 12:00:00 +0000</pubDate></item></channel></rss>';
$items=dagCatalogKavkazRSS($rss);
verify2026(count($items)===1 && $items[0]['artist']==='Ислам Гуков','Kavkaz RSS');
verify2026($items[0]['release_date']==='' && $items[0]['published_date']==='2026-11-17','publication differs from release');
$html='<html><article><h3><a href="https://kavkazmusic.tv/some-song">Зезаг Исмаилова. «Хьоме нус»</a></h3><time datetime="2026-11-16">16.11.2026</time></article></html>';
$parsed=dagCatalogKavkazHTML($html);
verify2026(count($parsed)===1 && $parsed[0]['title']==='Хьоме нус','Kavkaz HTML fallback');
echo "CATALOG_2026_SOURCES_RELEASE_DATES_URL_SECURITY_OK\n";
