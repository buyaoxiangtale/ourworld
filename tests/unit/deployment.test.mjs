import assert from 'node:assert/strict';
import {execFile,execFileSync,spawn} from 'node:child_process';
import {once} from 'node:events';
import {copyFile,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {promisify} from 'node:util';

const execute=promisify(execFile);
const script=new URL('../../scripts/deploy/backend.sh',import.meta.url);
const oldImage='sha256:previous1234567890';
const newImage='sha256:candidate1234567890';

async function fixture(t,failure=''){
 const root=await mkdtemp(join(tmpdir(),'ourworld-release-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const bin=join(root,'bin');
 await mkdir(bin);
 await mkdir(join(root,'scripts/deploy'),{recursive:true});
 await copyFile(script,join(root,'scripts/deploy/backend.sh'));
 await writeFile(join(root,'marker.txt'),'committed');
 await writeFile(join(root,'compose.yaml'),'committed compose');
 const git=(...args)=>execFileSync('git',args,{cwd:root,stdio:'pipe',encoding:'utf8'}).trim();
 git('init','--initial-branch=release');
 git('add','marker.txt','compose.yaml','scripts/deploy/backend.sh');
 git('-c','user.name=Release Test','-c','user.email=release@example.test','commit','-m','Release fixture');
 const revision=git('rev-parse','HEAD');
 await writeFile(join(root,'marker.txt'),'uncommitted');
 await writeFile(join(root,'compose.yaml'),'uncommitted compose');
 await writeFile(join(root,'api-image'),oldImage);
 const env={...process.env,PATH:bin+':'+process.env.PATH,TMPDIR:root,TEST_ROOT:root,TEST_FAILURE:failure,TEST_REVISION:revision,TEST_OLD:oldImage,TEST_NEW:newImage};
 await writeFile(join(bin,'docker'),String.raw`#!/usr/bin/env bash
set -eu
log="$TEST_ROOT/events"
case "$1" in
  ps) echo legacy-frontend ;;
  stop) echo stop-watcher >> "$log" ;;
  inspect) cat "$TEST_ROOT/api-image" ;;
  build)
    target='' iidfile='' revision=''
    while (( $# > 1 )); do
      case "$1" in
        --target) target=$2; shift ;;
        --iidfile) iidfile=$2; shift ;;
        --label) revision=$(cut -d= -f2 <<< "$2"); shift ;;
      esac
      shift
    done
    [[ "$(cat "$1/marker.txt")" == committed && "$revision" == "$TEST_REVISION" ]]
    echo "build-$target" >> "$log"
    [[ "$TEST_FAILURE" != "build-$target" ]]
    if [[ "$target" == api ]]; then echo "$TEST_NEW" > "$iidfile"; else echo sha256:frontend > "$iidfile"; fi
    ;;
  image)
    if [[ "$2" == inspect ]]; then
      echo "$TEST_NEW"
      exit 0
    fi
    if [[ "$4" == ourworld-api:local ]]; then
      if [[ "$3" == ourworld-api:rollback-* ]]; then
        echo "$TEST_OLD" > "$TEST_ROOT/tagged"
      else
        echo "$3" > "$TEST_ROOT/tagged"
      fi
    fi
    ;;
  compose)
    [[ "$(cat "$7")" == 'committed compose' ]]
    shift 7
    case "$1" in
      ps) printf 'api-1\napi-2\nworker-1\n' ;;
      up)
        candidate=$(cat "$TEST_ROOT/tagged")
        echo "up-$candidate" >> "$log"
        [[ "$TEST_FAILURE" != api || "$candidate" != "$TEST_NEW" ]]
        if [[ "$TEST_FAILURE" != image || "$candidate" != "$TEST_NEW" ]]; then
          echo "$candidate" > "$TEST_ROOT/api-image"
        fi
        ;;
      exec) echo reload-gateway >> "$log" ;;
      run)
        if [[ "$*" == *migrate ]]; then
          echo migrate >> "$log"
          [[ "$TEST_FAILURE" != migrate ]]
        else
          echo publish >> "$log"
          if [[ "$TEST_FAILURE" != publish ]]; then touch "$TEST_ROOT/activated"; fi
          [[ "$*" == *"$TEST_REVISION" && "$TEST_FAILURE" != publish && "$TEST_FAILURE" != publish-ambiguous ]]
        fi
        ;;
      *) exit 9 ;;
    esac
    ;;
  *) exit 9 ;;
esac
`,{mode:0o755});
 await writeFile(join(bin,'curl'),`#!/usr/bin/env bash
set -eu
if [[ "$*" == *api/v1/ready ]]; then
 echo ready >> "$TEST_ROOT/events"
 [[ "$TEST_FAILURE" != ready || "$(cat "$TEST_ROOT/api-image")" != "$TEST_NEW" ]]
elif [[ -f "$TEST_ROOT/activated" ]]; then
 echo verify-frontend >> "$TEST_ROOT/events"
 [[ "$TEST_FAILURE" != verify ]]
 printf '{"revision":"%s"}' "$TEST_REVISION"
else
 printf '{"version":"previous"}'
fi
`,{mode:0o755});
 const release=()=>execute('bash',['scripts/deploy/backend.sh','release'],{cwd:root,env});
 const events=async()=>(await readFile(join(root,'events'),'utf8')).trim().split('\n');
 return {root,release,events,revision};
}

test('both artifacts come from one committed snapshot and the frontend switches after API readiness',async t=>{
 const {release,events,revision}=await fixture(t);
 const result=await release();
 assert.match(result.stdout,new RegExp(revision));
 assert.deepEqual(await events(),[
  'build-api','build-frontend-release','stop-watcher','migrate','up-'+newImage,'reload-gateway','ready','publish','verify-frontend',
 ]);
});

test('a failed frontend build leaves the running release untouched',async t=>{
 const {release,events}=await fixture(t,'build-frontend-release');
 await assert.rejects(release());
 assert.deepEqual(await events(),['build-api','build-frontend-release']);
});

test('a failed migration leaves both running versions untouched',async t=>{
 const {release,events}=await fixture(t,'migrate');
 await assert.rejects(release());
 assert.deepEqual(await events(),['build-api','build-frontend-release','stop-watcher','migrate']);
});

for(const failure of ['api','image','ready','publish']){
 test('a failure at '+failure+' keeps the old frontend and restores the old API and worker',async t=>{
  const {release,events,root}=await fixture(t,failure);
  await assert.rejects(release());
  const calls=await events();
  assert.equal(calls.includes('publish'),failure==='publish');
  assert(!calls.includes('verify-frontend'));
  assert.deepEqual(calls.slice(-3),['up-'+oldImage,'reload-gateway','ready']);
  assert.equal((await readFile(join(root,'api-image'),'utf8')).trim(),oldImage);
 });
}

test('a failed frontend HTTP verification keeps the new API for the already activated frontend',async t=>{
 const {release,events,root}=await fixture(t,'verify');
 await assert.rejects(release());
 assert.deepEqual((await events()).slice(-2),['publish','verify-frontend']);
 assert.equal((await readFile(join(root,'api-image'),'utf8')).trim(),newImage);
});

test('a publisher failure after activation never rolls the API back',async t=>{
 const {release,events,root}=await fixture(t,'publish-ambiguous');
 await assert.rejects(release());
 assert.deepEqual((await events()).slice(-2),['publish','verify-frontend']);
 assert.equal((await readFile(join(root,'api-image'),'utf8')).trim(),newImage);
});

test('a concurrent release fails before building or changing containers',async t=>{
 const {release,events,root}=await fixture(t);
 const lock=spawn('flock',['-x',join(root,'.git/ourworld-release.lock'),'sh','-c','echo locked; read ignored'],{stdio:['pipe','pipe','ignore']});
 const completed=once(lock,'exit');
 try{
  await once(lock.stdout,'data');
  await assert.rejects(release(),/已有 Ourworld 发布在执行/);
  await assert.rejects(events(),{code:'ENOENT'});
 }finally{
  lock.stdin.end('\n');
  await completed;
 }
});
