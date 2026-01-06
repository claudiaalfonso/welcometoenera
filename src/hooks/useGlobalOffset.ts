import { useState, useEffect, useCallback, useSyncExternalStore } from "react";

// ============================================================
// GLOBAL OFFSET SYSTEM - Single source of truth for audio sync
// ============================================================

const STORAGE_KEY = "enera_global_offset_seconds";
const DEFAULT_OFFSET = -0.45; // Text is late, pull it earlier
const MIN_OFFSET = -5;
const MAX_OFFSET = 5;

// Module-level state
let globalOffset = DEFAULT_OFFSET;
let debugModeEnabled = false;
const listeners = new Set<() => void>();

// Initialize from localStorage
const initFromStorage = () => {
  if (typeof window === "undefined") return;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) {
    const parsed = parseFloat(stored);
    if (!isNaN(parsed)) {
      globalOffset = Math.max(MIN_OFFSET, Math.min(MAX_OFFSET, parsed));
    }
  }
};

// Run initialization immediately
initFromStorage();

// Notify all listeners of state change
const notifyListeners = () => {
  listeners.forEach(listener => listener());
};

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Get the current global offset value
 */
export const getGlobalOffset = (): number => globalOffset;

/**
 * Set the global offset and persist to localStorage
 */
export const setGlobalOffset = (offset: number): void => {
  const clamped = Math.max(MIN_OFFSET, Math.min(MAX_OFFSET, offset));
  const rounded = Math.round(clamped * 100) / 100;
  globalOffset = rounded;
  localStorage.setItem(STORAGE_KEY, String(rounded));
  notifyListeners();
};

/**
 * Check if debug mode is enabled (D toggle)
 */
export const isDebugModeEnabled = (): boolean => debugModeEnabled;

/**
 * Set debug mode state
 */
export const setDebugModeEnabled = (enabled: boolean): void => {
  debugModeEnabled = enabled;
  notifyListeners();
};

/**
 * Calculate effective time based on debug mode
 * When debug mode is ON: applies offset
 * When debug mode is OFF: returns raw time (offset is baked into cue sheet for production)
 */
export const getEffectiveTime = (rawTime: number): number => {
  // Always apply offset - it's needed for sync
  return rawTime + globalOffset;
};

/**
 * Convert effective time back to raw audio time (for seeking)
 */
export const effectiveToRawTime = (effectiveTime: number): number => {
  return effectiveTime - globalOffset;
};

// ============================================================
// REACT HOOK - Subscribe to offset/debug changes
// ============================================================

const subscribe = (callback: () => void) => {
  listeners.add(callback);
  return () => listeners.delete(callback);
};

const getSnapshot = () => ({
  offset: globalOffset,
  debugMode: debugModeEnabled,
});

// Create stable reference for useSyncExternalStore
let snapshotCache = getSnapshot();
const getCachedSnapshot = () => snapshotCache;

const subscribeWithCache = (callback: () => void) => {
  const wrappedCallback = () => {
    snapshotCache = getSnapshot();
    callback();
  };
  listeners.add(wrappedCallback);
  return () => listeners.delete(wrappedCallback);
};

/**
 * React hook to use global offset with automatic re-renders
 */
export const useGlobalOffset = () => {
  const state = useSyncExternalStore(subscribeWithCache, getCachedSnapshot, getCachedSnapshot);
  
  const adjustOffset = useCallback((delta: number) => {
    setGlobalOffset(globalOffset + delta);
  }, []);
  
  const resetOffset = useCallback(() => {
    setGlobalOffset(DEFAULT_OFFSET);
  }, []);
  
  const resetToZero = useCallback(() => {
    setGlobalOffset(0);
  }, []);

  return {
    offset: state.offset,
    debugMode: state.debugMode,
    setOffset: setGlobalOffset,
    adjustOffset,
    resetOffset,
    resetToZero,
    setDebugMode: setDebugModeEnabled,
    getEffectiveTime,
    effectiveToRawTime,
    DEFAULT_OFFSET,
  };
};
