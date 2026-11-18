<?php
// Openverse: accept only explicitly licensed Wikimedia Commons audio.
function dagOpenverseTracks(array $response): array {
    if (!is_array($response['results'] ?? null)) return [];
    $out=[];
    foreach (array_slice($response['results'],0,30) as $item) {
        if (!is_array($item) || ($item['category'] ?? '') !== 'music' || !empty($item['mature'])) continue;
        $license=strtolower(trim((string)($item['license'] ?? '')));
        if (!in_array($license,['cc0','pdm','by'],true)) continue;
        $licUrl=trim((string)($item['license_url'] ?? ''));
        if ($license==='by' && !preg_match('~^https://creativecommons\.org/licenses/by/[0-9.]+/?$~iD',$licUrl)) continue;
        if ($license==='cc0' && !preg_match('~^https://creativecommons\.org/publicdomain/zero/1\.0/?$~iD',$licUrl)) continue;
        if ($license==='pdm' && !preg_match('~^https://creativecommons\.org/publicdomain/mark/1\.0/?$~iD',$licUrl)) continue;
        $url=trim((string)($item['url'] ?? ''));
        $parsed=parse_url($url);
        if (!is_array($parsed) || ($parsed['scheme'] ?? '') !== 'https' ||
            strtolower((string)($parsed['host'] ?? '')) !== 'upload.wikimedia.org' ||
            isset($parsed['user']) || isset($parsed['pass']) || isset($parsed['port']) ||
            strlen($url)>1800) continue;
        $path=(string)($parsed['path'] ?? '');
        if (!str_starts_with($path,'/wikipedia/commons/') ||
            !preg_match('/\.(mp3|ogg|oga|opus|m4a|aac)$/iD',$path)) continue;
        $title=trim(strip_tags((string)($item['title'] ?? '')));
        $artist=trim(strip_tags((string)($item['creator'] ?? 'Неизвестен')));
        $title=function_exists('mb_substr')?mb_substr($title,0,180):substr($title,0,180);
        $artist=function_exists('mb_substr')?mb_substr($artist,0,180):substr($artist,0,180);
        if ($title==='') continue;
        $landing=trim((string)($item['foreign_landing_url'] ?? ''));
        if (!preg_match('~^https://commons\.wikimedia\.org/wiki/(?:File|Category):~i',$landing)) $landing='';
        $out[]=[
            'title'=>$title,'artist'=>$artist,'url'=>$url,'type'=>'audio',
            'thumb'=>'images/cover.png','source'=>'[OPENVERSE]',
            'license_url'=>$licUrl,'source_url'=>$landing,
            // Openverse's indexed_on is not a musical release date.
            'release_date'=>''
        ];
    }
    return $out;
}
