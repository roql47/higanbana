import test from 'node:test';import assert from 'node:assert/strict';
import {ShrineInvitation,SHRINE_INVITATION} from '../src/story/shrineInvitation.ts';
test('missing evidence never advances the slab or accepts the goal',()=>{const s=new ShrineInvitation();for(let i=0;i<20;i++)s.advance(false);assert.equal(s.index,-1);assert.equal(s.accepted,false);});
test('goal appears only after every line and remains stable on reread',()=>{const s=new ShrineInvitation();for(let i=0;i<SHRINE_INVITATION.length;i++){assert.equal(s.advance(true),SHRINE_INVITATION[i]);assert.equal(s.accepted,false);}s.advance(true);assert.equal(s.accepted,true);const index=s.index;s.advance(true);assert.equal(s.index,index);assert.equal(s.accepted,true);});
test('leaving before finishing cannot accept the invitation',()=>{const s=new ShrineInvitation();s.advance(true);s.advance(true);assert.equal(s.accepted,false);assert.equal(s.advance(true),SHRINE_INVITATION[2]);});
