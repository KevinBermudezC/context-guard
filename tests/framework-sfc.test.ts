import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractCodeSkeleton } from '../src/skeletonizer.js';

describe('Frontend Frameworks & SFC Distillation (SPEC-002)', () => {
  it('should distill Svelte components, extracting runes and collapsing styles', () => {
    const svelteCode = `
<script lang="ts">
  import { onMount } from 'svelte';

  let { name, age } = $props();
  let count = $state(0);
  let double = $derived(count * 2);

  function increment() {
    count += 1;
  }
</script>

<main>
  <h1>Hello {name}!</h1>
  <button on:click={increment}>Count: {count}</button>
</main>

<style>
  main {
    text-align: center;
    padding: 1em;
    max-width: 240px;
    margin: 0 auto;
    color: red;
  }
  h1 {
    color: #ff3e00;
    text-transform: uppercase;
    font-size: 4em;
    font-weight: 100;
  }
</style>
    `.trim();

    const skeleton = extractCodeSkeleton(svelteCode, '.svelte');
    assert.ok(skeleton !== null);
    if (!skeleton) throw new Error('Skeleton is null');

    assert.ok(skeleton.includes('$props()'));
    assert.ok(skeleton.includes('$state(0)'));
    assert.ok(skeleton.includes('$derived(count * 2)'));
    assert.ok(skeleton.includes('function increment()'));
    // Style block should be collapsed
    assert.ok(skeleton.includes('🎨') && skeleton.includes('líneas de CSS colapsadas'));
  });

  it('should distill Vue components with script setup macros and collapse scoped styles', () => {
    const vueCode = `
<script setup lang="ts">
  import { ref, computed } from 'vue';

  const props = defineProps<{ title: string }>();
  const emit = defineEmits<['submit']>();
  const active = ref(false);
  const formattedTitle = computed(() => props.title.toUpperCase());
</script>

<template>
  <div class="card">
    <h2>{{ formattedTitle }}</h2>
  </div>
</template>

<style scoped>
  .card {
    background: #fff;
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
  h2 {
    margin: 0;
    font-size: 18px;
  }
</style>
    `.trim();

    const skeleton = extractCodeSkeleton(vueCode, '.vue');
    assert.ok(skeleton !== null);
    if (!skeleton) throw new Error('Skeleton is null');

    assert.ok(skeleton.includes('defineProps'));
    assert.ok(skeleton.includes('defineEmits'));
    assert.ok(skeleton.includes('ref'));
    assert.ok(skeleton.includes('computed'));
    assert.ok(skeleton.includes('🎨') && skeleton.includes('CSS colapsadas'));
  });

  it('should distill Angular components with decorators and modern Signals', () => {
    const angularCode = `
import { Component, input, output, signal } from '@angular/core';

@Component({
  selector: 'app-user-badge',
  templateUrl: './user-badge.component.html'
})
export class UserBadgeComponent {
  readonly userId = input.required<string>();
  readonly statusChanged = output<boolean>();
  readonly isOnline = signal(false);

  ngOnInit() {
    console.log('init');
  }

  public toggleStatus() {
    this.isOnline.set(!this.isOnline());
  }
}
    `.trim();

    const skeleton = extractCodeSkeleton(angularCode, '.ts');
    assert.ok(skeleton !== null);
    if (!skeleton) throw new Error('Skeleton is null');

    assert.ok(skeleton.includes('@Component'));
    assert.ok(skeleton.includes('export class UserBadgeComponent'));
    assert.ok(skeleton.includes('userId = input.required<string>()'));
    assert.ok(skeleton.includes('statusChanged = output<boolean>()'));
    assert.ok(skeleton.includes('isOnline = signal(false)'));
    assert.ok(skeleton.includes('ngOnInit()'));
    assert.ok(skeleton.includes('public toggleStatus()'));
  });

  it('should distill Astro components extracting frontmatter and props', () => {
    const astroCode = `
---
import Header from '../components/Header.astro';

interface Props {
  title: string;
}

const { title } = Astro.props;
---
<html lang="en">
  <body>
    <Header />
    <h1>{title}</h1>
  </body>
</html>
    `.trim();

    const skeleton = extractCodeSkeleton(astroCode, '.astro');
    assert.ok(skeleton !== null);
    if (!skeleton) throw new Error('Skeleton is null');

    assert.ok(skeleton.includes('interface Props'));
    assert.ok(skeleton.includes('const { title } = Astro.props'));
  });
});
