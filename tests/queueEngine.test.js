import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enqueue, nextToCall, insertionIndex } from '../Utils/queueEngine.js';

// helper: build a line from labels like "S1 S2 R1 R2" and show it back as a string
const parse = (s) => s.trim().split(/\s+/).map((l) => ({ label: l, category: l[0] }));
const show = (q) => q.map((t) => t.label).join(' ');
const add = (line, label) => show(enqueue(parse(line), { label, category: label[0] }));

test('regular always goes to the back', () => {
  assert.equal(add('R1 S1', 'R2'), 'R1 S1 R2');
});

test('empty line: first ticket is simply first', () => {
  assert.equal(show(enqueue([], { label: 'S1', category: 'S' })), 'S1');
});

test('Scenario 1: S arrives behind 3 regulars -> 2nd place', () => {
  assert.equal(add('R1 R2 R3', 'S1'), 'R1 S1 R2 R3');
});

test('Scenario 2: second S -> 4th place', () => {
  assert.equal(add('R1 S1 R2 R3', 'S2'), 'R1 S1 R2 S2 R3');
});

test('third S in the same pattern -> 6th place', () => {
  assert.equal(add('R1 S1 R2 S2 R3', 'S3'), 'R1 S1 R2 S2 R3 S3');
});

test('user example: S1 S2 R1 R2, then S3, then S4', () => {
  let line = 'S1 S2 R1 R2';
  line = add(line, 'S3');
  assert.equal(line, 'S1 S2 R1 S3 R2');
  line = add(line, 'S4');
  assert.equal(line, 'S1 S2 R1 S3 R2 S4');
});

test('only priority waiting: first-come-first-served among them', () => {
  assert.equal(add('S1 S2', 'S3'), 'S1 S2 S3');
});

test('no consecutive jumping: many S behind few R go to the back', () => {
  let line = 'R1 R2';
  for (const l of ['S1', 'S2', 'S3', 'S4']) line = add(line, l);
  assert.equal(line, 'R1 S1 R2 S2 S3 S4');
});

test('pattern survives people being called', () => {
  // R1 was called and left the waiting list
  assert.equal(add('S1 R2 S2 R3', 'S3'), 'S1 R2 S2 R3 S3');
});

test('after head priority is called, next S still takes the second regular slot', () => {
  assert.equal(add('R2 R3', 'S2'), 'R2 S2 R3');
});

test('regulars keep their relative order no matter how many S arrive', () => {
  let line = 'R1 R2 R3 R4';
  for (const l of ['S1', 'S2', 'S3', 'S4', 'S5']) line = add(line, l);
  const regulars = line.split(' ').filter((x) => x[0] === 'R');
  assert.deepEqual(regulars, ['R1', 'R2', 'R3', 'R4']);
});

test('nextToCall returns the head, or null', () => {
  assert.equal(nextToCall(parse('S1 R1')).label, 'S1');
  assert.equal(nextToCall([]), null);
});

test('insertionIndex never exceeds length', () => {
  assert.equal(insertionIndex([], 'S'), 0);
  assert.equal(insertionIndex(parse('R1'), 'R'), 1);
});
