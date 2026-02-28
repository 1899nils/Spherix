export interface Podcast {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  imageUrl: string | null;
  feedUrl: string;
  websiteUrl: string | null;
  itunesId: string | null;
  lastFetchedAt: string | null;
  subscribedAt: string;
  episodeCount: number;
}

export interface PodcastEpisode {
  id: string;
  podcastId: string;
  guid: string;
  title: string;
  description: string | null;
  audioUrl: string;
  imageUrl: string | null;
  duration: number | null;
  fileSize: string | null;
  publishedAt: string | null;
}

export interface PodcastDetail extends Podcast {
  episodes: PodcastEpisode[];
}

export interface ItunesSearchResult {
  collectionId: number;
  collectionName: string;
  artistName: string;
  feedUrl: string;
  artworkUrl600: string;
  genres: string[];
  trackCount: number;
  country: string;
}
