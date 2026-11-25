<?php
// Extra public, licensed audio providers for the unified DAGSTUDIO search.
// Strict per-host URLs, limited responses, no authentication, no HTML scraping.
// Only original playable audio with an explicit permissive license is returned.

function dagExtraMusicLicense(string $license): string {
    $license = trim($license);
    if (preg_match('~^https?://creativecommons\.org/(licenses/(by|by-sa)/[234]\.0|publicdomain/(zero|mark)/1\.0)/?$~i', $license, $m))
        return 'https://creativecommons.org/' . $m[1] . '/';
    return '';
}

function dagExtraMusicHttpJson(string $url, int $seconds = 4): array {
    $p = parse_url($url);
    if (!is_array($p) || ($p['scheme']??'') !== 'https' || isset($p['port']) ||
        isset($p['user']) || isset($p['pass']) ||
        !in_array($p['host']??'', ['commons.wikimedia.org','archive.org'], true))
        return [];
    $buf = '';
    $c = curl_init($url);
    curl_setopt_array($c, [
        CURLOPT_FOLLOWLOCATION=>false, CURLOPT_SSL_VERIFYPEER=>true,
        CURLOPT_SSL_VERIFYHOST=>2, CURLOPT_CONNECTTIMEOUT=>min(3,$seconds),
        CURLOPT_TIMEOUT=>$seconds, CURLOPT_ENCODING=>'', CURLOPT_IPRESOLVE=>CURL_IPRESOLVE_WHATEVER,
        CURLOPT_USERAGENT=>'DAGSTUDIO-PLAYER/1.0 (https://pl.dagstudio.ru; licensed music search)',
        CURLOPT_HTTPHEADER=>['Accept: application/json'],
        CURLOPT_WRITEFUNCTION=>static function($c,string $chunk) use (&$buf): int {
            if (strlen($buf) + strlen($chunk) > 1100000) return 0;
            $buf .= $chunk;
            return strlen($chunk);
        }
    ]);
    curl_exec($c);
    $status=(int)curl_getinfo($c,CURLINFO_RESPONSE_CODE);
    $err=curl_errno($c);
    curl_close($c);
    if ($err || $status!==200 || $buf==='') return [];
    $value=json_decode($buf,true);
    return is_array($value)?$value:[];
}

function dagExtraMusicDate($value): string {
    $s=trim((string)$value);
    $date=substr($s,0,10);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/',$date)) return '';
    return checkdate((int)substr($date,5,2),(int)substr($date,8,2),(int)substr($date,0,4)) &&
        $date <= gmdate('Y-m-d') ? $date : '';
}

function dagExtraMusicClean($text, int $limit=180): string {
    $text=is_string($text)?$text:'';
    $text=html_entity_decode(strip_tags($text), ENT_QUOTES|ENT_HTML5,'UTF-8');
    return mb_substr(trim(preg_replace('/\s+/u',' ',$text)??''),0,$limit);
}

function dagExtraMusicCommonsUrl(string $url): bool {
    $p=parse_url($url);
    return is_array($p) && ($p['scheme']??'')==='https' &&
        ($p['host']??'')==='upload.wikimedia.org' &&
        str_starts_with((string)($p['path']??''),'/wikipedia/commons/') &&
        !isset($p['user']) && !isset($p['pass']) && !isset($p['port']) &&
        (bool)preg_match('/\.(mp3|ogg|oga|opus|flac|wav|m4a|aac)$/iD',(string)($p['path']??''));
}

function dagExtraMusicCommons(array $json): array {
    $out=[];
    foreach (array_slice($json['query']['pages']??[],0,25) as $page) {
        if (!is_array($page)) continue;
        $info=$page['imageinfo'][0]??null;
        if (!is_array($info))continue;
        $url=(string)($info['url']??'');
        $mime=(string)($info['mime']??'');
        if (!dagExtraMusicCommonsUrl($url) ||
            !in_array($mime,[
                'audio/mpeg','audio/ogg','application/ogg','audio/opus',
                'audio/flac','audio/x-flac','audio/wav','audio/x-wav',
                'audio/aac','audio/mp4'
            ],true))continue;
        $meta=$info['extmetadata']??[];
        $short=dagExtraMusicClean($meta['LicenseShortName']['value']??'',60);
        $license=dagExtraMusicLicense((string)($meta['LicenseUrl']['value']??''));
        if (!$license && preg_match('/^CC0(?: [0-9.]+)?$/i',$short))
            $license='https://creativecommons.org/publicdomain/zero/1.0/';
        if (!$license && in_array(mb_strtolower($short),['public domain','public domain mark','pd'],true))
            $license='https://creativecommons.org/publicdomain/mark/1.0/';
        if (!$license)continue; // Unknown, non-commercial, proprietary rights.
        $title=dagExtraMusicClean((string)($page['title']??''));
        $title=preg_replace('/^(?:File|Файл):/u','',$title);
        $title=preg_replace('/\.(mp3|ogg|oga|opus|flac|wav|m4a|aac)$/i','',$title);
        $title=str_replace('_',' ',$title);
        // Commons also hosts speech snippets and dictionary pronunciations.
        // Those are not music tracks and should not crowd actual songs.
        if (preg_match('/\b(pronunciation|voice of america|folk tales|spoken word|wiktionary)\b/i',$title))
            continue;
        $author=dagExtraMusicClean($meta['Artist']['value']??'',140);
        if (!$author) $author='Wikimedia Commons';
        if (!$title)continue;
        $out[]=[
            'title'=>$title,'artist'=>$author,'url'=>$url,
            'type'=>'audio','thumb'=>'images/cover.png',
            'source'=>'[COMMONS]','source_url'=>(string)($info['descriptionurl']??''),
            'license_url'=>$license,'release_date'=>''
        ];
    }
    return $out;
}

function dagExtraMusicCommonsApi(string $query, int $page=1): string {
    return 'https://commons.wikimedia.org/w/api.php?'.http_build_query([
        'action'=>'query','generator'=>'search','gsrsearch'=>$query.' filetype:audio',
        'gsrnamespace'=>6,'gsroffset'=>min(200,($page-1)*15),
        'gsrlimit'=>15,'prop'=>'imageinfo','iiprop'=>'url|mime|extmetadata',
        'format'=>'json','formatversion'=>2
    ],'','&',PHP_QUERY_RFC3986);
}

function dagExtraMusicArchiveApi(string $query,int $page=1): string {
    // Solr escaping: quoted title/artist phrases; unrestricted free-text query
    // must never change the mediatype and license predicates.
    $safe=preg_replace('/[^\p{L}\p{N}\s-]/u',' ',mb_substr($query,0,85));
    $safe=trim(preg_replace('/\s+/u',' ',$safe));
    // Archive's own advanced-search guide specifies licenseurl:http*
    // wildcard matching; literal substring matching yielded no index hits.
    // Every candidate is rechecked against its actual CC license metadata.
    $expr='mediatype:audio AND licenseurl:http* AND (title:("'.$safe.'") OR creator:("'.$safe.'") OR subject:("'.$safe.'"))';
    return 'https://archive.org/advancedsearch.php?'.http_build_query([
        'q'=>$expr,'fl'=>['identifier','title','creator','date','licenseurl'],
        'rows'=>8,'page'=>min(10,$page),'output'=>'json'
    ],'','&',PHP_QUERY_RFC3986);
}

function dagExtraMusicArchiveCandidates(array $json): array {
    $out=[];
    foreach (array_slice($json['response']['docs']??[],0,8) as $item) {
        if (!is_array($item))continue;
        $id=(string)($item['identifier']??'');
        $license=dagExtraMusicLicense((string)($item['licenseurl']??''));
        if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9_.-]{2,110}$/D',$id) || !$license)continue;
        $out[$id]=$item;
    }
    return $out;
}

function dagExtraMusicArchiveFiles(string $id,array $details): array {
    $meta=$details['metadata']??[];
    if (!is_array($meta) || !in_array((string)($meta['mediatype']??''),['audio','etree'],true))return [];
    $license=dagExtraMusicLicense((string)($meta['licenseurl']??''));
    if (!$license)return [];
    $artist=dagExtraMusicClean(is_array($meta['creator']??null)?implode(', ',$meta['creator']):(string)($meta['creator']??''),140);
    $itemTitle=dagExtraMusicClean($meta['title']??$id);
    $date=dagExtraMusicDate($meta['date']??'');
    $out=[];
    foreach (array_slice($details['files']??[],0,90) as $file) {
        if (!is_array($file))continue;
        $name=(string)($file['name']??'');
        $length=(int)($file['size']??0);
        if ($length<90000 || $length>75000000 || !preg_match('/\.(mp3|ogg|oga|opus|flac|m4a)$/iD',$name) ||
            preg_match('/(sample|preview|spectrogram|thumb|_meta)/i',$name))continue;
        $stream='https://archive.org/download/'.rawurlencode($id).'/'.implode('/',array_map('rawurlencode',explode('/',$name)));
        $song=dagExtraMusicClean(preg_replace('/\.(mp3|ogg|oga|opus|flac|m4a)$/i','',basename($name)));
        if (preg_match('/^\d+[-_. ]+(.*)$/u',$song,$m))$song=trim($m[1]);
        if (!$song || preg_match('/^(__ia_thumb|metadata)$/i',$song))continue;
        $out[]=['title'=>$song,'artist'=>$artist?:$itemTitle,'url'=>$stream,
            'type'=>'audio','thumb'=>'images/cover.png',
            'source'=>'[ARCHIVE]','source_url'=>'https://archive.org/details/'.rawurlencode($id),
            'license_url'=>$license,'release_date'=>$date];
        if (count($out)>=3)break;
    }
    return $out;
}

function dagExtraMusicArchiveTracks(array $search, string $query, bool $fast=false): array {
    $items=dagExtraMusicArchiveCandidates($search);
    $out=[];
    foreach (array_slice($items,0,$fast?2:4,true) as $id=>$item) {
        $json=dagExtraMusicHttpJson('https://archive.org/metadata/'.rawurlencode((string)$id),$fast?3:5);
        foreach (dagExtraMusicArchiveFiles((string)$id,$json) as $track) $out[]=$track;
        if (count($out)>=8)break;
    }
    return $out;
}
