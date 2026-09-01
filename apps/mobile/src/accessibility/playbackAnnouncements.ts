import type { PlaybackState } from '../playback/types';

export function playbackAnnouncement(
  previous: PlaybackState,
  current: PlaybackState,
): string | null {
  if (current.error && current.error !== previous.error)
    return `အသံဖွင့်၍ မရပါ။ ${current.error}`;
  if (current.item?.id !== previous.item?.id && current.item)
    return `${current.item.title} ကို ရွေးထားသည်`;
  if (current.phase === previous.phase) return null;
  if (current.phase === 'playing') return 'အသံ စတင်ဖွင့်နေသည်';
  if (current.phase === 'buffering') return 'အသံကို ကြိုတင်ရယူနေသည်';
  if (current.phase === 'ready' && previous.phase === 'playing')
    return current.duration > 0 && current.position >= current.duration - 1
      ? 'အသံ ပြီးဆုံးပြီ'
      : 'အသံ ခေတ္တရပ်ထားသည်';
  return null;
}
