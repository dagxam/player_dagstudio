<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/catalog-sources.php';

function checkCatalog(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}
$words = ['miyagi'];
$html = '<html><body>'
    . '<a href="/21985-miyagi-imenno-ta.html">Miyagi — Именно та</a>'
    . '<a href="/21985-miyagi-imenno-ta.html">Miyagi — Именно та</a>'
    . '<a href="https://not-muzrecord.com/1234-miyagi.mp3">Miyagi — fake</a>'
    . '<a href="/category/hiphop">Miyagi — genre</a>'
    . '</body></html>';
$result = dagCatalogHtml($html, 'muzrecord', $words);
checkCatalog(count($result) === 1, 'MuzRecord should contain one matching real catalog link');
checkCatalog($result[0]['playable'] === false, 'Catalog links must not become playable');
checkCatalog($result[0]['source'] === 'MUZRECORD', 'Incorrect provider source');

$hitmos = dagCatalogHtml('<a href="/song/123456">Miyagi — Песня</a>', 'hitmos', $words);
checkCatalog(count($hitmos) === 1 && $hitmos[0]['source'] === 'HITMOS', 'Hitmos parse failed');

$pace = dagCatalogHtml('<a href="/mp3/40760">Ислам Итляшев — Азия</a>',
    'muzpace', ['ислам','итляшев']);
checkCatalog(count($pace) === 1, 'MuzPace catalog matching failed');

$feed = json_encode([
    ['title'=>'Ислам Итляшев, Сакит Самедов. «Азия»',
     'url'=>'https://zvuk-m.com/test-post/','subtype'=>'post'],
    ['title'=>'Другая композиция', 'url'=>'https://zvuk-m.com/other/','subtype'=>'post'],
    ['title'=>'Ислам Итляшев', 'url'=>'https://evil.example.org/','subtype'=>'post']
], JSON_UNESCAPED_UNICODE);
$posts = dagCatalogWordpress((string)$feed,'zvukm',['ислам','итляшев']);
checkCatalog(count($posts) === 1, 'WP API must return only same-origin matching post');
checkCatalog($posts[0]['playable'] === false, 'WP posts are metadata only');

checkCatalog(dagCatalogLink('https://muzpace.net.evil.com/mp3/123',
    'muzpace.net','~^/mp3/\d+$~') === '', 'Cross-host injection accepted');
checkCatalog(dagCatalogLink('https://muzpace.net:8080/mp3/123',
    'muzpace.net','~^/mp3/\d+$~') === '', 'Unsafe port accepted');
checkCatalog(dagCatalogLink('http://muzpace.net/mp3/123',
    'muzpace.net','~^/mp3/\d+$~') === '', 'HTTP link accepted');
checkCatalog(dagCatalogSearch('a')['success'] === false,
    'One-letter query must be rejected');
echo "CATALOG_DISCOVERY_ONLY_AND_SOURCE_VALIDATION_OK\n";
