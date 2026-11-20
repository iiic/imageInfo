/**
 * @file sandbox-modules/imageInfoSandbox/format.globals.d.ts
 * @description Global TypeScript declarations for sandbox-modules/imageInfoSandbox/format.mjs — the values of the listing of the
 * images as text (sizes, the file name, the format and the size of the image from the best source), sorting, searching and the
 * headers that concern the image (pure functions without DOM).
 */

declare global {

	namespace Functions {

		namespace ImageInfoSandbox {

			namespace Format {

				/** Does the response header concern the image (its type, size, caching, a name that points at an image)? */
				type isImageHeader = ( name: string ) => boolean;

				/** The value of a response header by its name (case-insensitive), or null */
				type headerValue = ( headers: Types.ImageInfo.Header[], name: string ) => string | null;

				/** A size in bytes in the language of the interface ("245 kB") */
				type formatBytes = ( bytes: number ) => string;

				/** A number in the language of the interface */
				type formatCount = ( value: number ) => string;

				/** A time (today) or a date with the time */
				type formatTime = ( ms: number ) => string;

				/** The name of the file from the address */
				type fileName = ( url: string ) => string;

				/** The metadata of the image when its file could be read, otherwise null */
				type metadataOf = ( image: Types.ImageInfo.ImageEntry ) => Types.ImageInfo.Metadata | null;

				/** The size of the file in bytes (Resource Timing, Content-Length, the read file), null = not known */
				type imageBytes = ( image: Types.ImageInfo.ImageEntry ) => number | null;

				/** The format (by the file, Content-Type, the address), null = not known */
				type imageFormat = ( image: Types.ImageInfo.ImageEntry ) => string | null;

				/** The size of the image in pixels [width, height], null = not known */
				type imageDimensions = ( image: Types.ImageInfo.ImageEntry ) => [ number, number ] | null;

				/** Content-Type and the real type of the file when they differ */
				type typeMismatch = ( image: Types.ImageInfo.ImageEntry ) => { declared: string; actual: string } | null;

				/** Did the response come from the cache (null = not known)? */
				type fromCache = ( image: Types.ImageInfo.ImageEntry ) => boolean | null;

				/** Did the loading fail? */
				type loadFailed = ( image: Types.ImageInfo.ImageEntry ) => boolean;

				/** Is the page in the tab an image alone (an image opened in the tab, not an HTML page)? */
				type isImagePage = ( page: Types.ImageInfo.Page ) => boolean;

				/** Has the page not loaded the image (yet) — no request, no Resource Timing, no file, its elements not loaded or not displayed? */
				type notLoaded = ( image: Types.ImageInfo.ImageEntry ) => boolean;

				/** Did the button "Remove from the document" remove the image from the page (no usage left, the removed ones listed)? */
				type isRemoved = ( image: Types.ImageInfo.ImageEntry ) => boolean;

				/** Does the page show the image in an <img> or an <input type="image"> without a text description (the badge "no text alternative")? */
				type missingLabel = ( image: Types.ImageInfo.ImageEntry ) => boolean;

				/** The kind of a serial number by the name of its entry of the metadata (…LensSerialNumber = the lens), null = not a serial number */
				type serialKind = ( name: string ) => Enums.ImageInfoSandbox.SerialKind | null;

				/** A serial number of the camera or of the lens in the metadata (the first one), null = none */
				type serialNumber = ( image: Types.ImageInfo.ImageEntry, kind: Enums.ImageInfoSandbox.SerialKind ) => string | null;

				/** The serial numbers of the camera or of the lens as identifiers (joined white space, upper case, without placeholders), each once */
				type serialIds = ( image: Types.ImageInfo.ImageEntry, kind: Enums.ImageInfoSandbox.SerialKind ) => string[];

				/** The own key of the records of a serial number (SERIAL_KEY_PREFIX — the same for both kinds) */
				type serialRecordKey = ( serial: string ) => string;

				/** A serial number with its kind as one text (the keys of maps and sets) */
				type serialRefKey = ( ref: Types.ImageInfoSandbox.SerialRef ) => string;

				/** The serial number that merges the records: the first one of the camera, otherwise the first one of the lens, null = none */
				type groupSerial = ( cameraSerials: readonly string[], lensSerials: readonly string[] ) => Types.ImageInfoSandbox.SerialRef | null;

				/** The serial number of the image its permanent record is stored under (groupSerial()), null = none */
				type imageGroupSerial = ( image: Types.ImageInfo.ImageEntry ) => Types.ImageInfoSandbox.SerialRef | null;

				/** The own key of the permanent record of an image — of its serial number (imageGroupSerial()), otherwise the key of the image */
				type permanentRecordKey = ( image: Types.ImageInfo.ImageEntry ) => string;

				/** The serial numbers of a kind of a permanent record */
				type recordSerials = ( record: Types.ImageInfoSandbox.PermanentRecord, kind: Enums.ImageInfoSandbox.SerialKind ) => string[];

				/** Does the file carry an embedded thumbnail (EXIF IFD1, JFXX, Photoshop)? */
				type hasEmbeddedThumbnail = ( image: Types.ImageInfo.ImageEntry ) => boolean;

				/** Does the page show the image in an <img> without the width or the height attribute? */
				type missingDimensions = ( image: Types.ImageInfo.ImageEntry ) => boolean;

				/** Is the image an http one on an https page (mixed content)? */
				type isMixedContent = ( image: Types.ImageInfo.ImageEntry, context: Types.ImageInfoSandbox.NoticeContext ) => boolean;

				/** Is the image a tracking pixel (another origin, at most TRACKING_PIXEL_SIZE px)? */
				type isTrackingPixel = ( image: Types.ImageInfo.ImageEntry ) => boolean;

				/** The size of an oversized image and the largest size the page renders it at, null = not oversized */
				type oversizedBy = ( image: Types.ImageInfo.ImageEntry, factor: number ) => { file: [ number, number ]; rendered: [ number, number ] } | null;

				/** What the properties need from the page (is it https) and the settings (the limits) */
				type noticeContext = ( page: Types.ImageInfo.Page | null, limits: Types.ImageInfoSandbox.NoticeLimits ) => Types.ImageInfoSandbox.NoticeContext;

				/** The properties of the image the listing can call attention to, in the order of NOTICE_TAGS */
				type noticeTags = ( image: Types.ImageInfo.ImageEntry, context: Types.ImageInfoSandbox.NoticeContext ) => Enums.ImageInfoSandbox.NoticeTag[];

				/** Has the image a property whose "Never hide" is on? */
				type isKept = ( image: Types.ImageInfo.ImageEntry, notices: Types.ImageInfoSandbox.Notices, context: Types.ImageInfoSandbox.NoticeContext ) => boolean;

				/** The images the page uses with the properties whose "Show on the page" is on, or "… over larger images" for an image that is not small (at most max) */
				type markedImages = (
					page: Types.ImageInfo.Page,
					notices: Types.ImageInfoSandbox.Notices,
					limits: Types.ImageInfoSandbox.NoticeLimits,
					small: Pick<Types.ImageInfoSandbox.SmallImages, 'width' | 'height'>,
					max: number
				) => { image: Types.ImageInfo.ImageEntry; tags: Enums.ImageInfoSandbox.NoticeTag[] }[];

				/** A text of at most max characters (a longer one shortened with …) */
				type clipText = ( text: string, max: number ) => string;

				/** The document of the listing for the notifications (the tab and Page.documentAt, otherwise the address), null = no tab */
				type noticeDocument = ( page: Types.ImageInfo.Page | null ) => string | null;

				/** The keys announced for the document so far (from the remembered ones, a value of any shape) */
				type announcedKeys = ( announced: unknown, documentKey: string ) => Set<string>;

				/** The remembered announced keys with the new ones of the document (bounded) */
				type rememberNotices = ( announced: unknown, documentKey: string, keys: string[] ) => Types.ImageInfoSandbox.AnnouncedNotices;

				/** The keys ("<key of the image>\n<property>") of the images of the listing to announce — not announced for the document yet */
				type newNotices = ( page: Types.ImageInfo.Page, notices: Types.ImageInfoSandbox.Notices, announced: Set<string>, limits: Types.ImageInfoSandbox.NoticeLimits ) => string[];

				/** The keys of the images among the announced keys, each once, at most max (the newest) */
				type announcedImages = ( keys: Iterable<string>, max: number ) => string[];

				/** The data of a click on a notification of the listing (checked), null = not one */
				type readNoticeClick = ( click: unknown ) => Types.ImageInfoSandbox.NoticeClick | null;

				/** The announced keys of a document as numbers: how many images and how many of them have each property */
				type countNotices = ( keys: Iterable<string> ) => { images: number; counts: Partial<Record<Enums.ImageInfoSandbox.NoticeTag, number>> };

				/** Did the server forbid storing the response (Cache-Control: no-store)? */
				type noStore = ( image: Types.ImageInfo.ImageEntry ) => boolean;

				/** Has the listing both the HTTP response headers (a request that did not fail) and the metadata of the file (the badge ✓)? */
				type hasAllInfo = ( image: Types.ImageInfo.ImageEntry ) => boolean;

				/** Does the image lack the headers or the metadata (an http(s) address — the button "Load information")? */
				type canFetch = ( image: Types.ImageInfo.ImageEntry ) => boolean;

				/** Can the browser block the image (an http(s) address — the button "Block the image permanently")? */
				type canBlock = ( image: Types.ImageInfo.ImageEntry ) => boolean;

				/** Can the image be saved from what the browser has (data:, blob:, the HTTP cache) — "Save", otherwise "Download"? */
				type canSaveFromBrowser = ( image: Types.ImageInfo.ImageEntry ) => boolean;

				/** The length of a width or height attribute in pixels (a number, with "px" or without), otherwise null */
				type attributeLength = ( value: string | null | undefined ) => number | null;

				/** The largest width and height of the sizes attribute of an icon ("16x16 32x32"), null = "any" or another form */
				type sizesDimensions = ( value: string | null | undefined ) => [ number, number ] | null;

				/** The size of the image by one usage (the size in HTML, the rendered size, sizes); failed: the image did not load */
				type usageDimensions = ( usage: Types.ImageInfo.Usage, failed: boolean ) => [ number, number ] | null;

				/** The estimated size of the image by its usages (the largest of them), null = no usage says */
				type estimatedDimensions = ( image: Types.ImageInfo.ImageEntry ) => [ number, number ] | null;

				/** Is the image an ICO file (by the file, Content-Type or the extension)? */
				type isIcoImage = ( image: Types.ImageInfo.ImageEntry ) => boolean;

				/** Is the image smaller than the width and at the same time than the height (its size, otherwise the estimate; an unknown size = no, except an ICO file)? */
				type isSmallImage = ( image: Types.ImageInfo.ImageEntry, width: number, height: number ) => boolean;

				/** The images in the order (a new array) */
				type sortImages = ( images: Types.ImageInfo.ImageEntry[], order: Enums.ImageInfoSandbox.SortOrder ) => Types.ImageInfo.ImageEntry[];

				/** Does the image match the searched text? */
				type matchesFilter = ( image: Types.ImageInfo.ImageEntry, text: string ) => boolean;

				/** The address of the page for cleaning dynamically (of the main frame, otherwise of the tab) without the fragment, null = not known */
				type pageAddress = ( page: Types.ImageInfo.Page ) => string | null;

				/** Cleaning dynamically after another listing (null = none): a new address of the same document hides the images of the previous one */
				type nextCleaning = ( cleaning: Types.ImageInfoSandbox.Cleaning, page: Types.ImageInfo.Page | null ) => Types.ImageInfoSandbox.Cleaning;

				/** Did the listing have the image before the last change of the address (and the page does not use it in more places now)? */
				type isCleared = ( image: Types.ImageInfo.ImageEntry, cleaning: Types.ImageInfoSandbox.Cleaning ) => boolean;

				/** The GPS position on OpenStreetMap */
				type mapUrl = ( gps: Types.ImageInfo.GpsPosition ) => string;

				/** The image for its permanent record — its usages, the values and the entries of the metadata within RECORD_LIMITS */
				type compactRecordImage = ( image: Types.ImageInfo.ImageEntry ) => Types.ImageInfo.ImageEntry;

				/** The permanent record of an image of the page (auto = the properties it is recorded automatically for, null = the button) */
				type permanentRecord = (
					image: Types.ImageInfo.ImageEntry,
					page: Types.ImageInfo.Page | null,
					limits: Types.ImageInfoSandbox.NoticeLimits,
					auto: Enums.ImageInfoSandbox.NoticeTag[] | null,
					now?: number,
				) => Types.ImageInfoSandbox.PermanentRecord;

				/** A record of the core as a permanent record of an image (its id and the record), null = not one the listing can show */
				type readRecordEntry = ( entry: unknown ) => Types.ImageInfoSandbox.RecordEntry | null;

				/** The page of a permanent record in a few words — the title, otherwise the host ("" = not known) */
				type recordPageLabel = ( page: Types.ImageInfoSandbox.PermanentRecord['page'] ) => string;

				/** The images of the listing to record automatically (a property whose "record" is on), without the keys in skip */
				type recordCandidates = (
					page: Types.ImageInfo.Page,
					notices: Types.ImageInfoSandbox.Notices,
					skip: ReadonlySet<string>,
					limits: Types.ImageInfoSandbox.NoticeLimits,
				) => Types.ImageInfoSandbox.RecordRequest[];

				/** The place of a permanent record in a word — the host of its page, otherwise its label */
				type recordSite = ( page: Types.ImageInfoSandbox.PermanentRecord['page'] ) => string;

				/** The images of the page whose serial number has a permanent record of another image from another page with the same serial number of the same kind (in the order of the page) */
				type serialMatches = ( page: Types.ImageInfo.Page, records: Iterable<Types.ImageInfoSandbox.RecordEntry> ) => Types.ImageInfoSandbox.SerialMatch[];

				/** The matches with only the serial numbers of the kinds (and their records); a match without them is left out */
				type matchesOfKinds = ( matches: Types.ImageInfoSandbox.SerialMatch[], kinds: ReadonlySet<Enums.ImageInfoSandbox.SerialKind> ) => Types.ImageInfoSandbox.SerialMatch[];

				/** The keys ("<key of the image>\n<kind> <serial number>") of the matches not announced for the document yet */
				type newMatches = ( matches: Types.ImageInfoSandbox.SerialMatch[], announced: ReadonlySet<string> ) => string[];

				/** The matches by the serial number (and its kind) — the places of its records and how many */
				type matchSummary = ( matches: Types.ImageInfoSandbox.SerialMatch[] ) => Types.ImageInfoSandbox.MatchSummary[];

				/** The records merged by the serial number of the camera, otherwise of the lens (a group of at least two records), the others alone — in the order of the records */
				type groupRecords = ( records: Types.ImageInfoSandbox.RecordEntry[] ) => Types.ImageInfoSandbox.RecordGroup[];

				/** The keys of the images whose permanent record the user removed, from the stored value */
				type dismissedKeys = ( stored: unknown ) => Set<string>;

				/** The stored keys with the key of an image added (dismissed) or taken away, at most MAX_DISMISSED_RECORDS */
				type dismissRecord = ( stored: unknown, key: string, dismissed: boolean ) => string[];

				namespace compactRecordImage {

					/** A header or an entry of the metadata with its value shortened */
					type clip = ( entry: [ string, string ] ) => [ string, string ];

				}

				namespace readRecordEntry {

					/** The known properties of a stored list (in the order of NOTICE_TAGS; the old "serial" of a record before version 3 by the kinds of its serial numbers) */
					type tags = ( value: unknown ) => Enums.ImageInfoSandbox.NoticeTag[];

					/** The stored serial numbers (texts, each once), null = not a list */
					type ids = ( value: unknown ) => string[] | null;

				}

			}

		}

	}

}

export { };
