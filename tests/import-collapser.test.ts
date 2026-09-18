import { describe, it } from 'node:test';
import assert from 'node:assert';
import { collapseImportWall } from '../src/import-collapser.js';

describe('Import Collapser (SPEC-002)', () => {
  it('should keep imports intact when total imports <= 5', () => {
    const lines = [
      "import { useState } from 'react';",
      "import { useEffect } from 'react';",
      "import { Button } from './Button.js';"
    ];

    const result = collapseImportWall(lines, '.tsx', 5);
    assert.strictEqual(result.hasCollapsed, false);
    assert.strictEqual(result.lines.length, 3);
  });

  it('should collapse import wall when total imports > 5', () => {
    const lines = [
      "import { Component } from '@angular/core';",
      "import { CommonModule } from '@angular/common';",
      "import { Observable } from 'rxjs';",
      "import { map, filter } from 'rxjs/operators';",
      "import { UserService } from './user.service.js';",
      "import { UserDto } from './user.dto.js';",
      "import { Config } from '../config.js';"
    ];

    const result = collapseImportWall(lines, '.ts', 5);
    assert.strictEqual(result.hasCollapsed, true);
    assert.strictEqual(result.lines.length, 1);

    const banner = result.lines[0];
    assert.ok(banner.includes('[L1-L7] 📦 7 imports colapsados'));
    assert.ok(banner.includes('@angular/core') || banner.includes('rxjs'));
    assert.ok(banner.includes('./user.service.js') || banner.includes('./user.dto.js'));
    assert.ok(banner.includes('Read(offset=1, limit=7)'));
  });
});
