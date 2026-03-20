import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock global chrome object
global.chrome = {
  storage: {
    sync: {
      get: vi.fn(),
      set: vi.fn(),
    },
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  scripting: {
    executeScript: vi.fn(),
  },
  runtime: {
    getURL: vi.fn((path: string) => `chrome-extension://mock-id/${path}`),
  },
  windows: {
    update: vi.fn(),
  },
} as unknown as typeof chrome;

// Mock PointerEvent for Radix UI
if (typeof window !== 'undefined') {
  class MockPointerEvent extends Event {
    button: number;
    ctrlKey: boolean;
    pointerType: string;

    constructor(type: string, props: PointerEventInit) {
      super(type, props);
      this.button = props.button || 0;
      this.ctrlKey = props.ctrlKey || false;
      this.pointerType = props.pointerType || 'mouse';
    }
  }
  window.PointerEvent = MockPointerEvent as any;
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
}
