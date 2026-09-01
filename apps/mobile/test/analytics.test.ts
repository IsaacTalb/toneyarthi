import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AudioMilestoneTracker,
  MobileAnalytics,
  type AnalyticsProvider,
} from '../src/analytics/index.ts';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test('dispatches asynchronously and absorbs provider failures', async () => {
  let sent = false;
  const provider: AnalyticsProvider = {
    send() {
      sent = true;
      throw new Error('provider unavailable');
    },
  };
  const client = new MobileAnalytics(provider);
  assert.doesNotThrow(() =>
    client.track('article_open', {
      article_id: 'article-1',
      entry_point: 'feed',
    }),
  );
  assert.equal(sent, false);
  await flush();
  assert.equal(sent, true);
});

test('audio progress emits only crossed 25/50/75 milestones once', async () => {
  const events: number[] = [];
  const client = new MobileAnalytics({
    send(name, properties) {
      if (name === 'audio_progress')
        events.push(
          (properties as { milestone_percent: number }).milestone_percent,
        );
    },
  });
  const tracker = new AudioMilestoneTracker(client);
  tracker.update('one', 26, 100);
  tracker.update('one', 80, 100);
  tracker.update('one', 90, 100);
  tracker.update('two', 51, 100);
  await flush();
  assert.deepEqual(events, [25, 50, 75, 25, 50]);
});
