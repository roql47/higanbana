import test from 'node:test';
import assert from 'node:assert/strict';
import {MoriInvestigation} from '../src/story/moriInvestigation.ts';
test('TV replay and guide cannot bypass three distinct traces',()=>{const s=new MoriInvestigation();s.guideRead=true;for(let i=0;i<5;i++)s.discover('tv');assert.equal(s.found.size,1);assert.equal(s.ready,false);s.discover('tea');assert.equal(s.ready,false);s.discover('geta');assert.equal(s.ready,true);});
test('chosen evidence controls inference and all five have a separate conclusion',()=>{const s=new MoriInvestigation();for(const id of ['tv','bell','alley'])s.discover(id);assert.match(s.conclusion,/있는 척/);s.discover('tea');s.discover('geta');assert.match(s.conclusion,/기다린/);});
