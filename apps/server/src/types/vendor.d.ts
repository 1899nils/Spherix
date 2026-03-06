declare module 'node-id3' {
  interface Tags {
    title?: string;
    artist?: string;
    album?: string;
    year?: string;
    trackNumber?: string;
    partOfSet?: string; // disc number
    genre?: string;
    unsynchronisedLyrics?: { language?: string; text: string };
    image?: {
      mime: string;
      type: { id: number; name?: string };
      description?: string;
      imageBuffer: Buffer;
    } | string;
    [key: string]: unknown;
  }

  interface WriteTags extends Tags {}

  function read(file: string | Buffer): Tags;
  function write(tags: WriteTags, file: string): boolean;
  function update(tags: WriteTags, file: string): boolean;
  function removeTags(file: string): boolean;
}

declare module 'flac-metadata' {
  import { Transform } from 'node:stream';

  interface MetaDataBlock {
    type: number;
    isLast: boolean;
    error: boolean;
    removed: boolean;
    hasData: boolean;
    remove: boolean;
    data: Buffer;
  }

  class Processor extends Transform {
    static MDB_TYPE_STREAMINFO: 0;
    static MDB_TYPE_PADDING: 1;
    static MDB_TYPE_APPLICATION: 2;
    static MDB_TYPE_SEEKTABLE: 3;
    static MDB_TYPE_VORBIS_COMMENT: 4;
    static MDB_TYPE_CUESHEET: 5;
    static MDB_TYPE_PICTURE: 6;

    constructor(options?: { parseMetaDataBlocks?: boolean });
    on(event: 'preprocess', listener: (mdb: MetaDataBlock) => void): this;
    on(event: 'postprocess', listener: (mdb: MetaDataBlock) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
    push(data: Buffer): boolean;
  }

  namespace data {
    class MetaDataBlockVorbisComment {
      static create(
        isLast: boolean,
        vendor: string,
        comments: string[],
      ): { publish(): Buffer };
    }

    class MetaDataBlockPicture {
      static create(
        isLast: boolean,
        pictureType: number,
        mimeType: string,
        description: string,
        width: number,
        height: number,
        bitsPerPixel: number,
        colors: number,
        pictureData: Buffer,
      ): { publish(): Buffer };
    }
  }
}
