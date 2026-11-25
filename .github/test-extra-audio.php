<?php
require dirname(__DIR__).'/open-audio-providers.php';
function ensure($value,string $message):void {
  if(!$value){fwrite(STDERR,"FAILED ".$message."\n");exit(1);}
}
$license=['LicenseUrl'=>['value'=>'https://creativecommons.org/licenses/by/4.0/'],
 'LicenseShortName'=>['value'=>'CC BY 4.0'],'Artist'=>['value'=>'Dagestan Artist']];
$fixture=['query'=>['pages'=>[
 ['title'=>'File:Caucasus_song.mp3','imageinfo'=>[[
    'url'=>'https://upload.wikimedia.org/wikipedia/commons/a/ab/Caucasus_song.mp3',
    'mime'=>'audio/mpeg','descriptionurl'=>'https://commons.wikimedia.org/wiki/File:Caucasus_song.mp3',
    'extmetadata'=>$license]]],
 ['title'=>'File:NotLicensed.mp3','imageinfo'=>[[
    'url'=>'https://upload.wikimedia.org/wikipedia/commons/a/ab/NotLicensed.mp3',
    'mime'=>'audio/mpeg','extmetadata'=>array_replace($license,[
      'LicenseUrl'=>['value'=>'https://creativecommons.org/licenses/by-nc/4.0/']])]]],
 ['title'=>'File:Injected.mp3','imageinfo'=>[[
    'url'=>'https://upload.wikimedia.org.evil.test/wikipedia/commons/xxx.mp3',
    'mime'=>'audio/mpeg','extmetadata'=>$license]]]]];
$result=dagExtraMusicCommons($fixture);
ensure(count($result)===1,'only permitted Commons media');
ensure($result[0]['source']==='[COMMONS]' && $result[0]['artist']==='Dagestan Artist','Commons attribution');
ensure($result[0]['release_date']==='','do not invent release dates');
ensure(dagExtraMusicLicense('https://creativecommons.org/licenses/by-nc/4.0/')==='','CC noncommercial denied');
ensure(dagExtraMusicCommonsUrl('https://upload.wikimedia.org/wikipedia/commons/a/b/song.ogg'),'valid OGG');
ensure(!dagExtraMusicCommonsUrl('https://upload.wikimedia.org.evil.test/a.mp3'),'spoof host');
$index=['response'=>['docs'=>[
 ['identifier'=>'dagestan_folk_2026','licenseurl'=>'https://creativecommons.org/licenses/by-sa/4.0/'],
 ['identifier'=>'private_file','licenseurl'=>'http://example.org/terms']
]]];
ensure(count(dagExtraMusicArchiveCandidates($index))===1,'Archive explicit license');
$details=[
  'metadata'=>['mediatype'=>'audio',
     'licenseurl'=>'https://creativecommons.org/licenses/by-sa/4.0/',
     'title'=>'Dagestan Folk','creator'=>'Singer','date'=>'2026-04-07'],
  'files'=>[
   ['name'=>'01-sample.mp3','size'=>'3000000'],
   ['name'=>'02-Dagestan Song.mp3','size'=>'3800000'],
   ['name'=>'03-cover.jpg','size'=>'100000'],
   ['name'=>'04-song.mp3','size'=>'500']
  ]];
$songs=dagExtraMusicArchiveFiles('dagestan_folk_2026',$details);
ensure(count($songs)===1,'not a sample or thumbnail');
ensure($songs[0]['title']==='Dagestan Song','song title');
ensure($songs[0]['release_date']==='2026-04-07','provider date used');
ensure(str_starts_with($songs[0]['url'],'https://archive.org/download/dagestan_folk_2026/'),'valid archive stream');
$details['metadata']['licenseurl']='https://creativecommons.org/licenses/by-nc/4.0/';
ensure(dagExtraMusicArchiveFiles('dagestan_folk_2026',$details)===[],'invalid license not published');
echo "EXTRA_AUDIO_COMMONS_ARCHIVE_LICENSE_TEST_OK\n";
