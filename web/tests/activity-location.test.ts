import test from 'node:test';
import assert from 'node:assert/strict';
import { optionalActivityLocation, readActivityLocation } from '../lib/activity-location';
test('records coordinates with original GPS timestamp', async () => {
 const timestamp = Date.now()-1000;
 const result = await readActivityLocation({getCurrentPosition(success) {
 success({coords:{latitude:-27.2,longitude:-49.6,accuracy:12},timestamp} as GeolocationPosition);
 }});
 assert.deepEqual(result,{latitude:-27.2,longitude:-49.6,accuracy:12,at:new Date(timestamp).toISOString()});
});
test('unavailable or denied GPS preserves heartbeat', async () => {
 assert.equal(await readActivityLocation(undefined),null);
 assert.equal(await readActivityLocation({getCurrentPosition(_s,e){e?.({code:1} as GeolocationPositionError)}}),null);
 assert.equal(await readActivityLocation({getCurrentPosition(){throw Error('unavailable')}}),null);
});
test('invalid and stale GPS is ignored', () => {
 const valid={latitude:0,longitude:0,accuracy:0,at:new Date().toISOString()};
 assert.deepEqual(optionalActivityLocation(valid),valid);
 for(const input of [null,{}, {...valid,latitude:91},{...valid,accuracy:-1},{...valid,at:new Date(Date.now()-600000).toISOString()}]) assert.equal(optionalActivityLocation(input),null);
});
