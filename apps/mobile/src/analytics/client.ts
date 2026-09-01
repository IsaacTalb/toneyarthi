import type { AnalyticsEventMap, AnalyticsEventName } from './events.ts';

export interface AnalyticsProvider {
  send<K extends AnalyticsEventName>(
    name: K,
    properties: Readonly<AnalyticsEventMap[K]>,
  ): Promise<void> | void;
}

export const noOpAnalyticsProvider: AnalyticsProvider = { send: () => {} };

/**
 * A provider-neutral, best-effort analytics boundary. Dispatch is deferred so
 * provider work can never delay navigation, playback, or another user action.
 */
export class MobileAnalytics {
  private provider: AnalyticsProvider;

  constructor(provider: AnalyticsProvider = noOpAnalyticsProvider) {
    this.provider = provider;
  }

  setProvider(provider: AnalyticsProvider) {
    this.provider = provider;
  }

  track<K extends AnalyticsEventName>(
    name: K,
    properties: Readonly<AnalyticsEventMap[K]>,
  ): void {
    const provider = this.provider;
    queueMicrotask(() => {
      try {
        void Promise.resolve(provider.send(name, properties)).catch(
          () => undefined,
        );
      } catch {
        // Analytics is deliberately lossy: it must never affect the user flow.
      }
    });
  }
}

export const analytics = new MobileAnalytics();
