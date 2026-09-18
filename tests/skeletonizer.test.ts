import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractCodeSkeleton, isSupportedExtension } from '../src/skeletonizer.js';

describe('Skeletonizer Tier 0 Extraction', () => {
  it('should identify supported extensions', () => {
    assert.strictEqual(isSupportedExtension('.ts'), 'ts');
    assert.strictEqual(isSupportedExtension('.py'), 'py');
    assert.strictEqual(isSupportedExtension('.go'), 'go');
    assert.strictEqual(isSupportedExtension('.rs'), 'rs');
    assert.strictEqual(isSupportedExtension('.java'), 'java');
    assert.strictEqual(isSupportedExtension('.txt'), null);
  });

  it('should extract TypeScript classes, interfaces, and functions with line numbers', () => {
    const tsCode = `
import { Config } from './config.js';
import path from 'path';

// Some comments
export interface UserProfile {
  id: string;
  name: string;
}

export class UserManager {
  private cache: Map<string, UserProfile>;

  public async fetchUser(id: string): Promise<UserProfile> {
    // 50 lines of boilerplate logic
    return { id, name: 'Alice' };
  }
}

export function calculateTotal(items: number[]): number {
  return items.reduce((a, b) => a + b, 0);
}
    `.trim();

    const skeleton = extractCodeSkeleton(tsCode, '.ts');
    assert.ok(skeleton !== null);
    assert.ok(skeleton.includes('[L1] import { Config } from \'./config.js\';'));
    assert.ok(skeleton.includes('export interface UserProfile'));
    assert.ok(skeleton.includes('export class UserManager'));
    assert.ok(skeleton.includes('public async fetchUser(id: string)'));
    assert.ok(skeleton.includes('export function calculateTotal(items: number[])'));
  });

  it('should extract Python classes and methods', () => {
    const pyCode = `
import os
import sys

class DataProcessor:
    def __init__(self, path: str):
        self.path = path

    def process(self):
        pass

async def async_fetch():
    pass
    `.trim();

    const skeleton = extractCodeSkeleton(pyCode, '.py');
    assert.ok(skeleton !== null);
    assert.ok(skeleton.includes('[L1] import os'));
    assert.ok(skeleton.includes('class DataProcessor:'));
    assert.ok(skeleton.includes('async def async_fetch()'));
  });
});
