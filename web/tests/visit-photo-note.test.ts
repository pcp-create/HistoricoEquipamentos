import {test} from 'node:test';import assert from 'node:assert/strict';import {visitPhotoNote} from '../lib/tasks/visit-photo-note';
test('existing visit photo notes become unique gallery references and retain the remaining context',()=>{
 const path='/api/visits/photos/af5b29b5-9637-42c0-ad98-81734143c3d8';
 const note=visitPhotoNote(`Cliente: A\nFoto da visita: ${path}\nFoto da visita: ${path}\n\nDemanda: proposta`);
 assert.deepEqual(note.photos,[path]);assert.ok(!note.text.includes(path));assert.match(note.text,/Cliente: A/);assert.match(note.text,/Demanda: proposta/);
 assert.deepEqual(visitPhotoNote('https://example.com/image.png'),{text:'https://example.com/image.png',photos:[]});assert.equal(visitPhotoNote('/api/visits/photos/invalid').photos.length,0);
});
