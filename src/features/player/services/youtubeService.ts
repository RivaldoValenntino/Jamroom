export interface YouTubeSearchResult {
  id: string; // YouTube 11-char Video ID
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  durationSeconds: number;
  durationFormatted: string;
}

const SEARCH_CACHE_KEY_PREFIX = 'jamroom_yt_cache_';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Extracts 11-character YouTube Video ID from any standard URL or ID string.
 */
export function extractYouTubeId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();

  // Direct 11-character ID check
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // Regex matching standard YouTube URL variants:
  // - youtube.com/watch?v=ID
  // - youtu.be/ID
  // - youtube.com/embed/ID
  // - music.youtube.com/watch?v=ID
  // - youtube.com/shorts/ID
  const regExp = /(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?|shorts)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = trimmed.match(regExp);

  return match && match[1] ? match[1] : null;
}

/**
 * Parses ISO 8601 duration format (e.g. PT4M33S, PT1H2M10S, PT45S) into total seconds.
 */
export function parseISO8601Duration(isoDuration: string): number {
  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const matches = isoDuration.match(regex);
  if (!matches) return 0;

  const hours = parseInt(matches[1] || '0', 10);
  const minutes = parseInt(matches[2] || '0', 10);
  const seconds = parseInt(matches[3] || '0', 10);

  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Formats seconds into MM:SS or HH:MM:SS string.
 */
export function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Reads cached search results from sessionStorage if available and valid.
 */
function getCachedResults(query: string): YouTubeSearchResult[] | null {
  try {
    const raw = sessionStorage.getItem(`${SEARCH_CACHE_KEY_PREFIX}${query.toLowerCase()}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) {
      sessionStorage.removeItem(`${SEARCH_CACHE_KEY_PREFIX}${query.toLowerCase()}`);
      return null;
    }
    return parsed.data as YouTubeSearchResult[];
  } catch {
    return null;
  }
}

/**
 * Caches search results to sessionStorage.
 */
function setCachedResults(query: string, results: YouTubeSearchResult[]): void {
  try {
    sessionStorage.setItem(
      `${SEARCH_CACHE_KEY_PREFIX}${query.toLowerCase()}`,
      JSON.stringify({
        timestamp: Date.now(),
        data: results,
      })
    );
  } catch {
    // Ignore storage quota errors in private browsing
  }
}

/**
 * Searches YouTube Data API v3 for videos matching the query with durations.
 */
export async function searchYouTube(query: string): Promise<YouTubeSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Check cache first
  const cached = getCachedResults(trimmed);
  if (cached) {
    return cached;
  }

  const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error('VITE_YOUTUBE_API_KEY is not configured in environment.');
  }

  // 1. Search videos by query
  const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
  searchUrl.searchParams.set('part', 'snippet');
  searchUrl.searchParams.set('q', trimmed);
  searchUrl.searchParams.set('type', 'video');
  searchUrl.searchParams.set('videoEmbeddable', 'true');
  searchUrl.searchParams.set('maxResults', '15');
  searchUrl.searchParams.set('key', apiKey);

  const searchRes = await fetch(searchUrl.toString());
  if (!searchRes.ok) {
    const errorBody = await searchRes.text();
    if (searchRes.status === 403) {
      if (
        errorBody.includes('PERMISSION_DENIED') ||
        errorBody.includes('Permission denied') ||
        errorBody.includes('accessNotConfigured') ||
        errorBody.includes('SERVICE_DISABLED')
      ) {
        throw new Error('YOUTUBE_API_NOT_ENABLED');
      }
      throw new Error('YOUTUBE_QUOTA_EXCEEDED');
    }
    throw new Error(`YouTube API search error (${searchRes.status}): ${errorBody}`);
  }

  const searchData = await searchRes.json();
  const items = searchData.items || [];
  if (items.length === 0) return [];

  const videoIds = items.map((item: any) => item.id.videoId).filter(Boolean).join(',');

  // 2. Fetch video content details (duration) in one batch query
  const detailsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
  detailsUrl.searchParams.set('part', 'contentDetails,snippet');
  detailsUrl.searchParams.set('id', videoIds);
  detailsUrl.searchParams.set('key', apiKey);

  const detailsRes = await fetch(detailsUrl.toString());
  if (!detailsRes.ok) {
    // If details fail, construct partial results
    return items.map((item: any) => ({
      id: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnailUrl: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '',
      durationSeconds: 0,
      durationFormatted: '00:00',
    }));
  }

  const detailsData = await detailsRes.json();
  const videoDetailsMap = new Map<string, any>();
  for (const v of detailsData.items || []) {
    videoDetailsMap.set(v.id, v);
  }

  const results: YouTubeSearchResult[] = items
    .map((item: any) => {
      const vId = item.id.videoId;
      const details = videoDetailsMap.get(vId);
      const isoDuration = details?.contentDetails?.duration || 'PT0S';
      const durationSeconds = parseISO8601Duration(isoDuration);

      return {
        id: vId,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        thumbnailUrl:
          details?.snippet?.thumbnails?.medium?.url ||
          item.snippet?.thumbnails?.medium?.url ||
          item.snippet?.thumbnails?.default?.url ||
          '',
        durationSeconds,
        durationFormatted: formatDuration(durationSeconds),
      };
    })
    .filter((res: YouTubeSearchResult) => Boolean(res.id));

  // Save to cache
  setCachedResults(trimmed, results);

  return results;
}

/**
 * Fetches single video metadata (by 11-char ID) without incurring heavy search quota.
 * Uses no-quota YouTube oEmbed as fallback if API key or quota fails!
 */
export async function fetchVideoDetails(videoId: string): Promise<YouTubeSearchResult> {
  const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY;

  if (apiKey) {
    try {
      const detailsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
      detailsUrl.searchParams.set('part', 'contentDetails,snippet');
      detailsUrl.searchParams.set('id', videoId);
      detailsUrl.searchParams.set('key', apiKey);

      const res = await fetch(detailsUrl.toString());
      if (res.ok) {
        const data = await res.json();
        const item = data.items?.[0];
        if (item) {
          const durationSeconds = parseISO8601Duration(item.contentDetails?.duration || 'PT0S');
          return {
            id: videoId,
            title: item.snippet.title,
            channelTitle: item.snippet.channelTitle,
            thumbnailUrl:
              item.snippet.thumbnails?.medium?.url ||
              item.snippet.thumbnails?.default?.url ||
              `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
            durationSeconds,
            durationFormatted: formatDuration(durationSeconds),
          };
        }
      }
    } catch {
      // Fall through to zero-quota oEmbed fallback
    }
  }

  // Zero-quota YouTube oEmbed fallback (Works without API key!)
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const oembedRes = await fetch(oembedUrl);
    if (oembedRes.ok) {
      const data = await oembedRes.json();
      return {
        id: videoId,
        title: data.title || `YouTube Track (${videoId})`,
        channelTitle: data.author_name || 'YouTube Creator',
        thumbnailUrl: data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        durationSeconds: 0,
        durationFormatted: '--:--',
      };
    }
  } catch {
    // Fall through to minimal structure
  }

  return {
    id: videoId,
    title: `YouTube Video (${videoId})`,
    channelTitle: 'YouTube',
    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    durationSeconds: 0,
    durationFormatted: '--:--',
  };
}
