/**
 * @file modules/imageInfo/metadata.globals.d.ts
 * @description Global TypeScript declarations for modules/imageInfo/metadata.mjs — the metadata of an image file read from
 * the bytes the browser has already loaded: the format by the signature, the size, EXIF (with GPS and the thumbnail), XMP,
 * IPTC-IIM, the Photoshop resources, the ICC profile and the structure of JPEG, PNG/APNG, GIF, WebP, AVIF/HEIF, JPEG XL,
 * JPEG 2000, TIFF, SVG, BMP, ICO/CUR, PSD and QOI (pure functions without DOM).
 */

declare global {

	namespace Types {

		namespace ImageInfo {

			/** The metadata.mjs namespace (the frame of the page loads it via import()) */
			type MetadataModule = typeof import( './metadata.mjs' );

			/** One entry of a group: the name (an EXIF tag name as exiftool has it, an XMP property prefix:name, …) and the value as text */
			type MetadataEntry = [ name: string, value: string ];

			/**
			 * A group of entries: "file" (the structure of the file), "animation", "jfif", "exif", "gps", "interop", "thumbnail", "mpf",
			 * "xmp", "iptc", "photoshop", "icc", "adobe", "ducky", "text" (PNG text chunks), "heif", "svg"
			 */
			type MetadataGroup = { id: string; entries: MetadataEntry[] };

			/** The GPS position in decimal degrees (south and west negative) and the altitude in meters */
			type GpsPosition = { latitude: number; longitude: number; altitude: number | null };

			/** The most common values for the listing (null = the file does not have it) */
			type MetadataSummary = {
				camera: string | null;
				lens: string | null;
				taken: string | null;
				software: string | null;
				author: string | null;
				copyright: string | null;
				title: string | null;
				description: string | null;
				gps: GpsPosition | null;

				/** The place of the shot in words (IPTC: the location, city, region, country) */
				place: string | null;
				orientation: string | null;
				colorProfile: string | null;

				/** The estimated quality of a JPEG (1–100) */
				quality: number | null;
				bitDepth: number | null;
				colorType: string | null;
			};

			/** The metadata of one file */
			type Metadata = {

				/** The format by the signature of the file ("JPEG", "PNG", "APNG", "WebP", "AVIF", …), null = unknown */
				format: string | null;

				/** The media type of the format by the signature (it may differ from Content-Type) */
				mime: string | null;
				width: number | null;
				height: number | null;
				animated: boolean;
				frames: number | null;

				/** false = only the beginning of the file was available */
				complete: boolean;

				/** The bytes the metadata was read from */
				size: number;
				summary: MetadataSummary;
				groups: MetadataGroup[];

				/**
				 * Problems as codes: "incomplete", "limit", "limit:xmp", "unknownFormat", "truncated:<part>" (the part is shorter than
				 * its structure says), "corrupt:<part>"
				 */
				warnings: string[];
			};

			/** The limits of the metadata of one file (the settings of imageInfo): the most entries, the most entries of one XMP packet */
			type MetadataLimits = { maxEntries: number; maxXmpEntries: number };

			/** complete: false — only the beginning of the file is available; the limits (without them MAX_ENTRIES, MAX_XMP_ENTRIES) */
			type MetadataOptions = { complete?: boolean } & Partial<MetadataLimits>;

			/** The entries an XMP packet may still give, and whether one was left out over them */
			type XmpBudget = { left: number; cut: boolean };

			/** The TIFF directories: IFD0 (the main image), IFD1 (the thumbnail), the EXIF, GPS and Interop subdirectories, the MPF index */
			type IfdKind = 'ifd0' | 'ifd1' | 'exif' | 'gps' | 'interop' | 'mpf';

			/** A TIFF structure being read: the bytes, where it starts (offsets are relative to it), the byte order, the directories read */
			type TiffState = {
				bytes: Uint8Array;
				start: number;
				end: number;
				le: boolean;
				visited: Set<number>;
				width: number | null;
				height: number | null;
			};

			/** A TIFF field value: numbers, rationals [numerator, denominator], or the bytes (BYTE, ASCII, UNDEFINED) */
			type TiffValues = Uint8Array | ( number | [ number, number ] )[];

			/** The raw GPS values for the decimal position */
			type GpsRaw = {
				latitude?: number;
				longitude?: number;
				latitudeRef?: string;
				longitudeRef?: string;
				altitude?: number;
				altitudeRef?: number;
			};

			/** The result being built */
			type MetadataContext = {
				bytes: Uint8Array;
				limits: MetadataLimits;
				meta: Metadata;
				groups: Map<string, MetadataEntry[]>;

				/** The first value of every entry name (for the summary) */
				first: Map<string, string>;
				warnings: Set<string>;
				count: number;
				gps: GpsRaw;
				depth: number;
			};

			/** An element of the XML tree (XMP, SVG) */
			type XmlNode = { name: string; attrs: Record<string, string>; children: XmlNode[]; text: string };

			/** An ISOBMFF box: its type, the start of its data and its end (cut to the data; declaredEnd as the box says) */
			type Box = { type: string; start: number; end: number; declaredEnd: number };

		}

	}

	namespace Functions {

		namespace ImageInfo {

			namespace Metadata {

				/** Throws Truncated when [offset, offset + length) is not within the bytes */
				type need = ( bytes: Uint8Array, offset: number, length: number ) => void;

				type u8 = ( bytes: Uint8Array, offset: number ) => number;

				type u16 = ( bytes: Uint8Array, offset: number, le?: boolean ) => number;

				type u24 = ( bytes: Uint8Array, offset: number, le?: boolean ) => number;

				type u32 = ( bytes: Uint8Array, offset: number, le?: boolean ) => number;

				type i32 = ( bytes: Uint8Array, offset: number, le?: boolean ) => number;

				/** An unsigned big-endian 64-bit number (exact up to 2^53) */
				type u64 = ( bytes: Uint8Array, offset: number ) => number;

				/** Bytes as text, one character per byte */
				type ascii = ( bytes: Uint8Array, offset: number, length: number ) => string;

				/** Do the bytes at offset start with the signature (one character per byte)? */
				type startsWith = ( bytes: Uint8Array, offset: number, signature: string ) => boolean;

				/** Bytes as text in the encoding (UTF-8 by default) */
				type decode = ( bytes: Uint8Array, encoding?: string ) => string;

				/** UTF-8 when valid, otherwise windows-1252 */
				type decodeGuess = ( bytes: Uint8Array ) => string;

				/** The position of the first zero byte from offset, or end */
				type zeroAt = ( bytes: Uint8Array, offset: number, end?: number ) => number;

				/** Inflates zlib or gzip data, at most MAX_INFLATE_BYTES */
				type inflate = ( bytes: Uint8Array, format?: CompressionFormat ) => Promise<Uint8Array>;

				/** A number with at most 4 decimal places */
				type formatNumber = ( value: number ) => string;

				/** A rational as a number (NaN with a zero denominator) */
				type ratio = ( rational: [ number, number ] ) => number;

				/** An exposure time: "1/250 s", "2 s" */
				type formatExposure = ( seconds: number ) => string;

				/** An f-number: "f/2.8" */
				type formatAperture = ( value: number ) => string;

				/** Degrees as D° M' S" with the hemisphere letter (positive or negative) */
				type formatDms = ( degrees: number, positive: string, negative: string ) => string;

				/** Text without control characters, trimmed, at most MAX_TEXT characters */
				type cleanText = ( value: string ) => string;

				type hex = ( bytes: Uint8Array ) => string;

				type createContext = ( bytes: Uint8Array, complete: boolean, limits: Types.ImageInfo.MetadataLimits ) => Types.ImageInfo.MetadataContext;

				/** One entry into the group (an empty value is left out; at most limits.maxEntries) */
				type add = ( ctx: Types.ImageInfo.MetadataContext, group: string, name: string, value: string | number | null | undefined ) => void;

				type setFormat = ( ctx: Types.ImageInfo.MetadataContext, format: string, mime: string ) => void;

				/** The size of the image (only the first valid one) */
				type setSize = ( ctx: Types.ImageInfo.MetadataContext, width: number, height: number ) => void;

				/** Runs a part of the parsing; an error becomes the warning "truncated:<part>" or "corrupt:<part>" */
				type attempt = ( ctx: Types.ImageInfo.MetadataContext, part: string, work: () => unknown ) => Promise<void>;

				/** The values of a TIFF field */
				type readTiffValues = ( tiff: Types.ImageInfo.TiffState, type: number, count: number, at: number ) => Types.ImageInfo.TiffValues;

				type toNumbers = ( values: Types.ImageInfo.TiffValues ) => number[];

				/** Are the bytes printable text? */
				type isPrintable = ( bytes: Uint8Array ) => boolean;

				/** The text of UserComment (8 bytes of the character code, then the text) */
				type readCommentText = ( bytes: Uint8Array, le: boolean ) => string;

				/** The value of a TIFF field as text by its kind (the tag tables) or its type */
				type formatTiffValue = ( tiff: Types.ImageInfo.TiffState, kind: string | undefined, type: number, values: Types.ImageInfo.TiffValues ) => string;

				/** One TIFF directory into its group (with the subdirectories and the embedded packets); the offset of the next one */
				type readIfd = ( ctx: Types.ImageInfo.MetadataContext, tiff: Types.ImageInfo.TiffState, offset: number, kind: Types.ImageInfo.IfdKind ) => Promise<number>;

				/** Notes a raw GPS value for the summary */
				type noteGps = ( ctx: Types.ImageInfo.MetadataContext, name: string, values: Types.ImageInfo.TiffValues ) => void;

				/** A TIFF structure at start (IFD0 and IFD1, or the MPF index); the size from IFD0 and the byte order */
				type parseTiff = (
					ctx: Types.ImageInfo.MetadataContext,
					bytes: Uint8Array,
					start?: number,
					kind?: Types.ImageInfo.IfdKind,
				) => Promise<{ width: number | null; height: number | null; byteOrder: string }>;

				/** XML entities into characters */
				type decodeEntities = ( text: string ) => string;

				/** A tolerant XML tokenizer into a tree (at most MAX_XML_NODES elements) */
				type parseXml = ( text: string ) => Types.ImageInfo.XmlNode;

				/** The descendants with the name (not below a found one) */
				type findNodes = ( node: Types.ImageInfo.XmlNode, name: string, found?: Types.ImageInfo.XmlNode[] ) => Types.ImageInfo.XmlNode[];

				/** Is the attribute part of the RDF structure (xmlns, rdf:about, …)? */
				type isRdfAttribute = ( name: string ) => boolean;

				/** Does the element have fields (child elements or property attributes)? */
				type isStruct = ( node: Types.ImageInfo.XmlNode ) => boolean;

				/** One entry of an XMP packet within its budget (an empty value does not count) */
				type addXmpEntry = ( ctx: Types.ImageInfo.MetadataContext, budget: Types.ImageInfo.XmpBudget, name: string, value: string ) => void;

				/** One XMP property as entries "path" → value (arrays, alternatives, structures) */
				type addXmpProperty = ( ctx: Types.ImageInfo.MetadataContext, path: string, node: Types.ImageInfo.XmlNode, depth: number, budget: Types.ImageInfo.XmpBudget ) => void;

				/** An XMP packet (or RDF) into the "xmp" group */
				type parseXmp = ( ctx: Types.ImageInfo.MetadataContext, text: string ) => void;

				/** IPTC-IIM datasets into the "iptc" group */
				type parseIptc = ( ctx: Types.ImageInfo.MetadataContext, bytes: Uint8Array ) => void;

				/** The Photoshop image resources (8BIM) */
				type parsePhotoshop = ( ctx: Types.ImageInfo.MetadataContext, bytes: Uint8Array ) => Promise<void>;

				/** The text of an ICC tag (desc, text, mluc) */
				type readIccText = ( bytes: Uint8Array, offset: number, size: number ) => string;

				/** An ICC profile into the "icc" group */
				type parseIcc = ( ctx: Types.ImageInfo.MetadataContext, bytes: Uint8Array ) => void;

				/** The JPEG quality (1–100) estimated from the luminance quantization table (zig-zag order); null for another table */
				type estimateJpegQuality = ( table: number[] ) => number | null;

				/** The chroma subsampling ("4:2:0", …) from the sampling factors of the components */
				type chromaSubsampling = ( factors: [ number, number ][] ) => string | null;

				type parseJpeg = ( ctx: Types.ImageInfo.MetadataContext ) => Promise<void>;

				/** CICP (ITU-T H.273) codes as text: primaries, transfer, matrix, range */
				type describeCicp = ( primaries: number, transfer: number, matrix: number, fullRange: boolean ) => string;

				type parsePng = ( ctx: Types.ImageInfo.MetadataContext ) => Promise<void>;

				/** Skips GIF data sub-blocks; the offset after them */
				type skipSubBlocks = ( bytes: Uint8Array, offset: number ) => number;

				/** Reads GIF data sub-blocks (the data limited) */
				type readSubBlocks = ( bytes: Uint8Array, offset: number ) => { data: Uint8Array; end: number };

				type parseGif = ( ctx: Types.ImageInfo.MetadataContext ) => void;

				type parseWebp = ( ctx: Types.ImageInfo.MetadataContext ) => Promise<void>;

				/** The ISOBMFF boxes between start and end */
				type readBoxes = ( bytes: Uint8Array, start: number, end: number ) => Types.ImageInfo.Box[];

				/** An unsigned number of 0, 2, 4 or 8 bytes */
				type readSized = ( bytes: Uint8Array, offset: number, size: number ) => number;

				/** The meta box of a HEIF/AVIF file: items, locations, properties of the primary item, Exif and XMP items */
				type parseHeif = ( ctx: Types.ImageInfo.MetadataContext, boxes: Types.ImageInfo.Box[] ) => Promise<void>;

				/** The size from the SizeHeader of a JPEG XL codestream (offset = right after FF 0A) */
				type readJxlSize = ( bytes: Uint8Array, offset: number ) => { width: number; height: number };

				type parseIsoBmff = ( ctx: Types.ImageInfo.MetadataContext ) => Promise<void>;

				/** An SVG length in px (or without a unit), otherwise null */
				type svgLength = ( value: string | undefined ) => number | null;

				type parseSvg = ( ctx: Types.ImageInfo.MetadataContext, compressed: boolean ) => Promise<void>;

				type parseBmp = ( ctx: Types.ImageInfo.MetadataContext ) => void;

				type parseIco = ( ctx: Types.ImageInfo.MetadataContext, cursor: boolean ) => void;

				type parsePsd = ( ctx: Types.ImageInfo.MetadataContext ) => Promise<void>;

				/** The format by the signature ("jpeg", "png", …, "svg", "gzip"), null = unknown */
				type detectFormat = ( bytes: Uint8Array ) => string | null;

				/** The metadata of an image file */
				type parseImageMetadata = ( bytes: Uint8Array, options?: Types.ImageInfo.MetadataOptions ) => Promise<Types.ImageInfo.Metadata>;

				/** The summary and the ordered groups into the result */
				type finish = ( ctx: Types.ImageInfo.MetadataContext ) => void;

			}

		}

	}

}

export { };
