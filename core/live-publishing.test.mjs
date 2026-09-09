import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectLiveWebsite } from './live-publishing.mjs';
const map = JSON.stringify({course:{currentLessonId:'excel-m01-l01'},lessons:[{id:'excel-m01-l01',title:'Excel M01'}]});
const html = '<article id="excel-m01-l01" data-status="current"></article>';
function fixture(remoteHTML = html, remoteMap = map) {
  return {readLocal: async path => path === 'index.html' ? html : map, fetcher:async url => ({ok:true,text:async()=>url.includes('course-map.json')?remoteMap:remoteHTML})};
}
test('verifies only when both live files match the saved update', async()=>{
  const status=await inspectLiveWebsite(fixture()); assert.equal(status.verified,true);assert.equal(status.matchesLocal,true);
});
test('does not claim live success for stale HTML during deployment',async()=>{
  const status=await inspectLiveWebsite(fixture('<article id="intro-m01-l03" data-status="current"></article>'));assert.equal(status.verified,false);assert.equal(status.matchesLocal,false);
});
test('same lesson with stale materials is not a verified update',async()=>{
  const status=await inspectLiveWebsite(fixture(html+'old materials'));assert.equal(status.verified,true);assert.equal(status.matchesLocal,false);
});
test('rejects duplicate current cards',async()=>{assert.equal((await inspectLiveWebsite(fixture(html+html))).verified,false);});
test('network failure is unknown instead of saved or live success',async()=>{
  const status=await inspectLiveWebsite({...fixture(),fetcher:async()=>{throw new Error('offline')}});assert.equal(status.verified,false);assert.match(status.error,/offline/);
});

test('verifies published commit even when a newer local draft exists',async()=>{
  const base=fixture();
  const result=await inspectLiveWebsite({...base, expectedCommit:'abcdef0',readLocal:async()=> 'new local draft',readPublished:base.readLocal,
    fetcher:async url=>url.includes('api.github.com')?{ok:true,text:async()=>JSON.stringify({workflow_runs:[{path:'dynamic/pages/pages-build-deployment',status:'completed',conclusion:'success'}]})}:base.fetcher(url)});
  assert.equal(result.matchesLocal,false);assert.equal(result.matchesPublished,true);assert.equal(result.deployment.conclusion,'success');
});
test('reports deployment failure without claiming the new files are live',async()=>{
  const base=fixture(html+'stale');
  const result=await inspectLiveWebsite({...base,expectedCommit:'abcdef0',readPublished:base.readLocal,
    fetcher:async url=>url.includes('api.github.com')?{ok:true,text:async()=>JSON.stringify({workflow_runs:[{path:'dynamic/pages/pages-build-deployment',status:'completed',conclusion:'failure'}]})}:base.fetcher(url)});
  assert.equal(result.matchesPublished,false);assert.equal(result.deployment.conclusion,'failure');
});
