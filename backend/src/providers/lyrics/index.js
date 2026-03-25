import { ZemereshetProvider } from './zemereshet.js';
import { ShironetProvider } from './shironet.js';
import { LrclibProvider } from './lrclib.js';
import { LyricsOvhProvider } from './lyricsovh.js';
import { NliProvider } from './nli.js';
import { Tab4uProvider } from './tab4u.js';
import { GoogleSitesLyricsProvider } from './googleSitesLyrics.js';

const PROVIDERS = [
  new ZemereshetProvider(),
  new ShironetProvider(),
  new NliProvider(),
  new Tab4uProvider(),
  new GoogleSitesLyricsProvider(),
  new LrclibProvider(),
  new LyricsOvhProvider(),
];

const CONFIDENCE_THRESHOLD = 0.5;

export async function fetchLyricsWithReport(title, artist) {
  let best = null;
  const attempts = [];

  for (const provider of PROVIDERS) {
    try {
      console.log(
        `[lyrics] trying provider=${provider.name} title="${title}" artist="${artist}"`
      );

      const result = await provider.fetch(title, artist);

      if (!result) {
        attempts.push({
          provider: provider.name,
          status: 'no_result',
        });
        console.log(`[lyrics] provider=${provider.name} no result`);
        continue;
      }

      attempts.push({
        provider: provider.name,
        status: 'ok',
        confidence_score: result.confidence_score,
        source: result.source || provider.name,
      });

      console.log(
        `[lyrics] provider=${provider.name} confidence=${result.confidence_score}`
      );

      if (result.confidence_score >= CONFIDENCE_THRESHOLD) {
        return {
          result,
          attempts,
        };
      }

      if (!best || result.confidence_score > best.confidence_score) {
        best = result;
      }
    } catch (err) {
      const message = err?.message || 'Unknown provider error';

      attempts.push({
        provider: provider?.name || 'unknown',
        status: 'error',
        error: message,
      });

      console.error(
        `[lyrics] provider=${provider?.name || 'unknown'} failed:`,
        message
      );
    }
  }

  return {
    result: best,
    attempts,
  };
}

export async function fetchLyrics(title, artist) {
  const { result } = await fetchLyricsWithReport(title, artist);
  return result;
}