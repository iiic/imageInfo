/**
 * @file sandbox-modules/imageInfoSandbox/module.globals.d.ts
 * @description Global TypeScript declarations for sandbox-modules/imageInfoSandbox/module.mjs — the description of the package
 * of the listing of the images of the page without DOM: the dependency on imageInfo, the functions outside the sandbox it works
 * with, the modes in which it follows the page, the sort order of the listing and the notices about the properties of images
 * (with their marks on the page).
 */

declare global {

	namespace Enums {

		namespace ImageInfoSandbox {

			/** The order of the listing: as on the page, the largest first, by the file name, by the format */
			type SortOrder = 'page' | 'size' | 'name' | 'type';

			/** A property of an image the listing can call attention to (NOTICE_TAGS of module.mjs) */
			type NoticeTag =
				| 'place'
				| 'camera'
				| 'taken'
				| 'serial'
				| 'lensSerial'
				| 'exifThumbnail'
				| 'copyright'
				| 'software'
				| 'noLabel'
				| 'noDimensions'
				| 'mismatch'
				| 'failed'
				| 'mixedContent'
				| 'trackingPixel'
				| 'crossOrigin'
				| 'animated'
				| 'oversized'
				| 'largeFile'
				| 'complete'
				| 'removed'
				| 'notLoaded'
				| 'unused'
				| 'fromCache'
				| 'lazy'
				| 'exif'
				| 'xmp'
				| 'iptc'
				| 'gps';

			/** What the listing does with an image that has the property: its badge, never hiding it, a notification, a permanent record, a mark on the page itself (over any image / only over one that is not small) */
			type NoticeAction = 'badge' | 'keep' | 'notify' | 'record' | 'page' | 'pageLarge';

			/** The kind of a serial number in the metadata: of the camera (the body) or of the lens (SERIAL_KINDS of module.mjs) */
			type SerialKind = 'camera' | 'lens';

		}

	}

	namespace Types {

		namespace ImageInfoSandbox {

			/** The module.mjs namespace — checked against Types.ModuleDescriptor (the full module description). */
			type Descriptor = Types.Satisfies<Types.ModuleDescriptor, typeof import( './module.mjs' )>;

			/** Ignoring small images: on/off and the width and height (px) below which an image is small */
			type SmallImages = { ignore: boolean; width: number; height: number };

			/** The notices about the properties of images (the setting of the module): the property → the action → on/off */
			type Notices = Record<Enums.ImageInfoSandbox.NoticeTag, Record<Enums.ImageInfoSandbox.NoticeAction, boolean>>;

			/** The limits of the notices (the settings of the module): the factor of an oversized image, the bytes of a large file */
			type NoticeLimits = { oversizeFactor: number; largeFileBytes: number };

			/** What the properties of an image need from the page and the settings: is the page https (an image without a usage), the limits */
			type NoticeContext = NoticeLimits & { pageSecure: boolean };

			/** The data of a notification of the listing (and of a click on it): the tab, the document (noticeDocument()) and the keys of its images */
			type NoticeClick = { tabId: number; document: string; images: string[] };

			/** The images announced by notifications (api.state — shared by all surfaces): [the document, its keys "<key of the image>\n<property>"], the newest last */
			type AnnouncedNotices = [ string, string[] ][];

			/**
			 * A permanent record of an image (the payload of api.data.log() — permanentRecord() of format.mjs, under the key of its
			 * first serial number of the camera, without one of the lens, without both under the key of the image —
			 * permanentRecordKey()): the image as the listing had it (shortened to RECORD_LIMITS), the page of the tab, whether it
			 * was https, the properties of the image then, its serial numbers and the time
			 */
			type PermanentRecord = {
				version: number;
				image: Types.ImageInfo.ImageEntry;
				page: { url: string | null; title: string | null };

				/** Was the page https (the properties of an image without a usage — mixed content)? */
				pageSecure: boolean;
				tags: Enums.ImageInfoSandbox.NoticeTag[];

				/** The serial numbers of the camera (serialIds() of format.mjs — versions 1 and 2 read them from the image); the first one is the group of the record */
				cameraSerials: string[];

				/** The serial numbers of the lens (the same); the first one is the group of a record without a serial number of the camera */
				lensSerials: string[];

				/** Recorded automatically for these properties (their "record" is on); null = the button "Record permanently" */
				auto: Enums.ImageInfoSandbox.NoticeTag[] | null;
				recordedAt: number;
			};

			/** A permanent record as the listing shows it: the id of the record of the core (api.data.remove()) and the record */
			type RecordEntry = { id: number; record: PermanentRecord };

			/** A serial number with its kind (of the camera or of the lens) */
			type SerialRef = { kind: Enums.ImageInfoSandbox.SerialKind; serial: string };

			/** The records of the section "Permanently recorded images" merged by the serial number: a group of one of the camera or of the lens (serial — at least two records), or a record alone (serial null) */
			type RecordGroup = { serial: SerialRef | null; entries: RecordEntry[] };

			/** A match of an image of the page with the permanent records (serialMatches() of format.mjs): its serial numbers that match (with their kind) and the records of other images from other pages, newest first */
			type SerialMatch = { image: Types.ImageInfo.ImageEntry; serials: SerialRef[]; records: RecordEntry[] };

			/** The matches by the serial number (and its kind): the places of its records (hosts) and how many records it has */
			type MatchSummary = SerialRef & { places: string[]; records: number };

			/** An image to record permanently: auto = the properties it is recorded automatically for, null = the button */
			type RecordRequest = { image: Types.ImageInfo.ImageEntry; auto: Enums.ImageInfoSandbox.NoticeTag[] | null };

			/** How recording an image ended: a new record, it already had one, or why it could not be recorded */
			type RecordOutcome = { status: 'recorded' | 'exists'; entry: RecordEntry } | { status: 'failed'; error: string };

			/**
			 * Cleaning dynamically (format.mjs): the tab, the document (Page.documentAt) and the address of the last listing, the
			 * usage counts of its images and of the images listed before the last change of the address of the same document
			 * (the key of the image → usageCount) — the listing leaves those out
			 */
			type Cleaning = {
				tabId: number | null;
				documentAt: number | null;
				address: string | null;
				last: Map<string, number>;
				before: Map<string, number>;
			};

		}

	}

	namespace Functions {

		namespace ImageInfoSandbox {

			namespace Module {

				/** The size of a small image from the stored value (text of a "number" field) — 1 … MAX_SMALL_SIZE, otherwise the default */
				type resolveSmallSize = ( value: unknown ) => number;

				/** The notices from the stored value (the table of Settings) — a stored choice, otherwise the default */
				type resolveNotices = ( value: unknown ) => Types.ImageInfoSandbox.Notices;

				/** The factor of an oversized image from the stored value — more than 1, at most MAX_OVERSIZE_FACTOR, otherwise the default */
				type resolveOversizeFactor = ( value: unknown ) => number;

				/** The kB of a large file from the stored value — 1 … MAX_LARGE_FILE_KB, otherwise the default */
				type resolveLargeFileKB = ( value: unknown ) => number;

				/** The name of a property in the language of the interface */
				type noticeTagText = ( tag: Enums.ImageInfoSandbox.NoticeTag ) => string;

				/** The icon of a property on the page (NOTICE_DEFAULT_ICON for a property without its own) */
				type noticeIcon = ( tag: Enums.ImageInfoSandbox.NoticeTag ) => string;

			}

		}

	}

}

export { };
