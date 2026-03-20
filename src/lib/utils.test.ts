import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn utility function', () => {
  it('should merge class names correctly', () => {
    expect(cn('class1', 'class2')).toBe('class1 class2');
  });

  it('should handle conditional class names', () => {
    expect(cn('class1', true && 'class2', false && 'class3')).toBe('class1 class2');
  });

  it('should resolve tailwind classes conflicts', () => {
    // twMerge should override px-2 with px-4
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
  });

  it('should handle arrays of classes', () => {
    expect(cn(['class1', 'class2'], 'class3')).toBe('class1 class2 class3');
  });

  it('should handle objects with boolean values', () => {
    expect(cn({ 'class1': true, 'class2': false, 'class3': true })).toBe('class1 class3');
  });
});
