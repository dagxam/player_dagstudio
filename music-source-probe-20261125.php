<?php
declare(strict_types=1);
// Temporary diagnostic: fixed, preapproved URLs; no user-provided network targets.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');
header('X-Content-Type-Options: nosniff');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') { http_response_code(405); exit; }
$targets = [
 ['id'=>'muzofond_miyagi','url'=>'https://muzofond.fm/search/Miyagi','term'=>'Miyagi'],
 ['id'=>'muzofond_islam','url'=>'https://muzofond.fm/search/%D0%98%D1%81%D0%BB%D0%B0%D0%BC%20%D0%98%D1%82%D0%BB%D1%8F%D1%88%D0%B5%D0%B2','term'=>'Ислам'],
 ['id'=>'muzrecord_main','url'=>'https://muzrecord.com/','term'=>'Miyagi'],
 ['id'=>'muzrecord_miyagi_artist','url'=>'https://muzrecord.com/artists/miyagi/','term'=>'Miyagi'],
 ['id'=>'muzrecord_caucasus','url'=>'https://muzrecord.com/kavkazskaja-muzyka/','term'=>'Итляшев'],
 ['id'=>'muzrecord_search_miyagi','url'=>'https://muzrecord.com/index.php?do=search&subaction=search&story=Miyagi','term'=>'Miyagi'],
 ['id'=>'hitmos_main','url'=>'https://rus.hitmos.fm/','term'=>'Miyagi'],
 ['id'=>'hitmos_search_query','url'=>'https://rus.hitmos.fm/search?q=Miyagi','term'=>'Miyagi'],
 ['id'=>'hitmos_search_path','url'=>'https://rus.hitmos.fm/search/Miyagi','term'=>'Miyagi'],
 ['id'=>'muzpace_caucasus','url'=>'https://muzpace.net/playlists/kavkazskaya','term'=>'Итляшев'],
 ['id'=>'muzpace_search','url'=>'https://muzpace.net/search/Miyagi','term'=>'Miyagi'],
 ['id'=>'nmuz_search_miyagi','url'=>'https://nmuz.net/search/Miyagi','term'=>'Miyagi'],
 ['id'=>'nmuz_search_islam','url'=>'https://nmuz.net/search/%D0%98%D1%81%D0%BB%D0%B0%D0%BC-%D0%98%D1%82%D0%BB%D1%8F%D1%88%D0%B5%D0%B2','term'=>'Итляшев'],
 ['id'=>'muzgate_search_islam','url'=>'https://muzgate.com/watch/%D0%98%D1%81%D0%BB%D0%B0%D0%BC-%D0%98%D1%82%D0%BB%D1%8F%D1%88%D0%B5%D0%B2','term'=>'Итляшев'],
 ['id'=>'muzbab_main','url'=>'https://muzbab.org/','term'=>'Ислам'],
 ['id'=>'muzbab_search','url'=>'https://muzbab.org/search?q=Miyagi','term'=>'Miyagi'],
 ['id'=>'muzyqa_main','url'=>'https://muzyqa.com/','term'=>'Miyagi'],
 ['id'=>'muzyqa_search','url'=>'https://muzyqa.com/search?q=Miyagi','term'=>'Miyagi']
];
$results = [];
if (!function_exists('curl_multi_init')) {echo json_encode(['error'=>'curl_unavailable']); exit;}
$multi = curl_multi_init();$channels=[];
foreach ($targets as $target) {
 $buffer = '';$location = '';
 $handle = curl_init($target['url']);
 curl_setopt_array($handle, [
  CURLOPT_RETURNTRANSFER=>false,
  CURLOPT_FOLLOWLOCATION=>false,
  CURLOPT_CONNECTTIMEOUT=>3,
  CURLOPT_TIMEOUT=>9,
  CURLOPT_SSL_VERIFYPEER=>true,
  CURLOPT_SSL_VERIFYHOST=>2,
  CURLOPT_IPRESOLVE=>CURL_IPRESOLVE_V4,
  CURLOPT_HTTP_VERSION=>CURL_HTTP_VERSION_1_1,
  CURLOPT_USERAGENT=>'DAGSTUDIO-PLAYER-SourceAvailabilityProbe/1.0',
  CURLOPT_HTTPHEADER=>['Accept: text/html,application/xhtml+xml','Accept-Language: ru-RU,ru;q=0.9'],
  CURLOPT_WRITEFUNCTION=>static function($handle,string $chunk)use(&$buffer):int{
   if(strlen($buffer)+strlen($chunk)>700000)return 0;
   $buffer.=$chunk;return strlen($chunk);
  },
  CURLOPT_HEADERFUNCTION=>static function($handle,string $line)use(&$location):int {
   if(stripos($line,'location:')===0)$location=trim(substr($line,9));
   return strlen($line);
  },
 ]);
 curl_multi_add_handle($multi,$handle);
 $channels[]=['handle'=>$handle,'target'=>$target,'body'=>&$buffer,'location'=>&$location];
 unset($buffer,$location);
}
$active=null;$cycles=0;
do{
 do{$state=curl_multi_exec($multi,$active);}while($state===CURLM_CALL_MULTI_PERFORM);
 if($active>0){$selected=curl_multi_select($multi,0.2);if($selected<0)usleep(25000);}
 $cycles++;
}while($active>0&&$cycles<1000);
foreach($channels as $entry){
 $ch=$entry['handle'];$body=(string)$entry['body'];$target=$entry['target'];
 $http=(int)curl_getinfo($ch,CURLINFO_RESPONSE_CODE);
 $ctype=(string)curl_getinfo($ch,CURLINFO_CONTENT_TYPE);
 $err=curl_errno($ch);
 $title='';
 if(preg_match('/<title[^>]*>(.*?)<\/title>/si',$body,$m))
     $title=mb_substr(trim(html_entity_decode(strip_tags($m[1]),ENT_QUOTES|ENT_HTML5,'UTF-8')),0,115);
 $term=$target['term'];
 $termHits=mb_substr_count(mb_strtolower(strip_tags($body),'UTF-8'),mb_strtolower($term,'UTF-8'));
 $samples=[];
 if(class_exists('DOMDocument')&&$http===200&&strlen($body)<700000){
     $prev=libxml_use_internal_errors(true);
     try{
         $doc=new DOMDocument();
         if(@$doc->loadHTML('<?xml encoding="utf-8"?>'.$body,LIBXML_NONET|LIBXML_NOERROR|LIBXML_NOWARNING)){
             $xp=new DOMXPath($doc);
             foreach($xp->query('//a[@href]') as $a){
                 $text=trim(preg_replace('/\s+/u',' ',$a->textContent)??'');
                 if(mb_strlen($text)<3||mb_strlen($text)>130)continue;
                 if(mb_stripos($text,$term)!==false&&!in_array($text,$samples,true)){
                     $samples[]=$text;
                     if(count($samples)>=4)break;
                 }
             }
         }
     }finally{libxml_clear_errors();libxml_use_internal_errors($prev);}
 }
 $results[]=[
  'id'=>$target['id'],'http'=>$http,
  'errno'=>$err,
  'type'=>mb_substr($ctype,0,55),
  'bytes'=>strlen($body),
  'title'=>$title,
  'term_hits'=>$termHits,
  'audio_attributes'=>preg_match_all('/(?:data-url|data-src|<audio\b|\.mp3\b)/i',$body),
  'track_markers'=>preg_match_all('/(?:tracks__item|track-item|track__title|data-track|music-item)/i',$body),
  'sample_links'=>$samples,
  'redirect'=>mb_substr((string)$entry['location'],0,140)
 ];
 curl_multi_remove_handle($multi,$ch);curl_close($ch);
}
curl_multi_close($multi);
echo json_encode(['tested_at'=>gmdate('c'),'host'=>'DAGSTUDIO production PHP',
 'note'=>'A track HTML match is NOT a verified licensed playable audio stream.',
 'results'=>$results],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
