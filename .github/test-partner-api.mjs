import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const api=read('api.php'),proxy=read('proxy.php'),partner=read('partner-config.php');
assert.match(api,/dagPartnerConfig\(\)/);
assert.match(api,/dagPartnerParse\(/);
assert.match(api,/'\[PARTNER\]'/);
assert.match(api,/'partner' => '\[PARTNER\]'/);
assert.match(proxy,/\$source === 'partner'/);
assert.match(proxy,/in_array\(\$host, \$partner\['audio_hosts'\], true\)/);
assert.match(partner,/DAG_PARTNER_RIGHTS_CONFIRMED/);
assert.match(partner,/playable/);
const result=spawnSync('php',['.github/test-partner-api.php'],{encoding:'utf8'});
if(result.error?.code!=='ENOENT'){
  assert.equal(result.status,0,result.stderr||result.stdout);
  assert.match(result.stdout,/LICENSED_PARTNER_API_RIGHTS_HOSTS_FULL_AUDIO_OK/);
}
console.log('PARTNER_AUDIO_SOURCE_WHITELIST_AND_PERMISSION_OK');

assert.match(read('script.js'),/track\.source !== '\[PARTNER\]'/);
console.log('PARTNER_FULL_STREAM_DOES_NOT_ASSUME_OFFLINE_LICENSE_OK');

assert.match(proxy,/\$isHead, \$source, &\$responseHeaders/);
assert.match(proxy,/CURLOPT_FOLLOWLOCATION => !in_array/);
