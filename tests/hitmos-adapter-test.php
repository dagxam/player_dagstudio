<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/hitmos-adapter.php';

function check(bool $ok, string $message): void {
    if (!$ok) { fwrite(STDERR, "FAIL HITMOS API: $message\n"); exit(1); }
}
check(dagHitmosSearchUrl('Мияги', 2) ===
    'https://ru.hitmos.site/search?q=%D0%9C%D0%B8%D1%8F%D0%B3%D0%B8&page=2',
    'URL building and Cyrillic encoding');
check(dagHitmosAudioUrl('http://ru.hitmos.site/audio/test.mp3') === '', 'HTTP rejected');
check(dagHitmosAudioUrl('https://evil.test/audio/test.mp3') === '', 'untrusted host rejected');
check(dagHitmosAudioUrl('//evil.test/audio/test.mp3') === '', 'protocol relative rejected');
check(dagHitmosAudioUrl('https://ru.hitmos.site/track/1') === '', 'page link rejected');
check(dagHitmosAudioUrl('https://ru.hitmos.site/music/1.mp3') !== '', 'explicit audio link accepted');
$fixture = <<<'HTML'
<!doctype html><html><body>
<li class="tracks__item">
  <div class="track__title">Мияги — Сон</div>
  <div class="track__desc">Мияги</div>
  <a class="track__download-btn" href="/music/miagi-son.mp3">Аудио</a>
</li>
<li class="tracks__item">
  <div class="track__title">Мияги — Злоумышленник</div>
  <a class="track__download-btn" href="https://evil.test/private.mp3">Запрет</a>
</li>
<li class="tracks__item">
  <div class="track__title">Случайный артист</div>
  <a class="track__download-btn" href="/music/other.mp3">Не подходит</a>
</li>
HTML;
$found = dagHitmosParseHtml($fixture, 'Мияги');
check(count($found) === 1, 'only the matching permitted song is returned');
check($found[0]['source'] === '[HITMOS]', 'proper source label');
check($found[0]['title'] === 'Мияги — Сон', 'Cyrillic content preserved');
check($found[0]['url'] === 'https://ru.hitmos.site/music/miagi-son.mp3', 'relative HTTPS audio resolution');
check(dagHitmosParseHtml('<h1>403 Forbidden</h1>', 'Мияги') === [], 'blocked page must not yield tracks');
check(dagHitmosParseHtml('<a href="/music/f.mp3">Music</a>', 'Music') === [], 'generic music links must not yield tracks');
check(dagHitmosSearch('a')['status'] === 'invalid_query', 'invalid query does not access network');
echo "HITMOS_API_ADAPTER_FIXTURE_AND_SECURITY_TESTS_OK\n";
