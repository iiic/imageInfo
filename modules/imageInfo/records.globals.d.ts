/**
 * @file modules/imageInfo/records.globals.d.ts
 * @description Global TypeScript declarations for modules/imageInfo/records.mjs — the network records of images the
 * background part keeps for every tab (the status, the response headers, from the cache, the IP address, the Accept header of
 * the request, the metadata captured while loading in Firefox), pure functions without chrome.*.
 */

declare global {

	namespace Types {

		namespace ImageInfo {

			/** A response header [name, value] (the value of Set-Cookie replaced by its length) */
			type Header = [ name: string, value: string ];

			/** A header as webRequest reports it */
			type HeaderLike = { name: string; value?: string; binaryValue?: unknown };

			/** The metadata read from the response while it loaded (Firefox, filterResponseData) */
			type CaptureResult = {
				metadata: Metadata | null;

				/** The bytes read (the beginning of the response, at most CAPTURE_MAX_BYTES) */
				bytes: number;
				complete: boolean;
				error: string | null;

				/** When it was captured (ms since 1970) */
				at: number;

				/** Read from a download by the button "Load information", not while the page loaded it */
				download?: boolean;
			};

			/** What the download of an image by the button "Load information" gives for its record */
			type DownloadResponse = { status: number; statusText: string; redirected: boolean; url: string; headers: [ string, string ][] };

			/** One redirect of a request: the address that answered, its status and where it sent the request */
			type Redirect = { url: string; statusCode: number | null; location: string };

			/** One recorded request of an image in a tab */
			type NetworkRecord = {

				/** The address the page asked for (of a redirected request the first one) */
				url: string;

				/** Where the redirects led (null = not redirected; records of older versions do not have it) */
				finalUrl?: string | null;

				/** The redirects in their order (records of older versions do not have them) */
				redirects?: Redirect[];
				method: string;

				/** The webRequest type: "image", "imageset" (Firefox), "main_frame" or "sub_frame" (a document that is an image) */
				type: string;
				frameId: number;

				/** The origin (Chrome) or the address (Firefox) of the page that asked for it */
				initiator: string | null;
				statusCode: number | null;
				statusLine: string | null;
				fromCache: boolean;
				ip: string | null;
				headers: Header[];

				/** The Accept header of the request (null = not recorded) */
				accept: string | null;
				startedAt: number;
				completedAt: number;

				/** The error of a failed request ("net::ERR_BLOCKED_BY_CLIENT", "NS_ERROR_…") */
				error: string | null;
				capture: CaptureResult | null;

				/** The record of a download by the button "Load information" (its headers are not those of the load of the page) */
				downloaded?: boolean;
			};

			/** What the background part notes when a request is sent, and its redirects */
			type RequestNote = { accept: string | null; startedAt: number; redirects: Redirect[] };

			/** A webRequest report the records are built from (onCompleted, onErrorOccurred) */
			type RequestDetails = {
				url: string;
				method?: string;
				type: string;
				tabId: number;
				frameId?: number;
				requestId: string;
				initiator?: string;
				originUrl?: string;
				statusCode?: number;
				statusLine?: string;
				fromCache?: boolean;
				ip?: string;
				responseHeaders?: HeaderLike[];
				timeStamp: number;
				error?: string;

				/** Firefox: a private window */
				incognito?: boolean;
			};

		}

	}

	namespace Functions {

		namespace ImageInfo {

			namespace Records {

				/** Response headers as [name, value] (limited, Set-Cookie hidden) */
				type normalizeHeaders = ( headers: Types.ImageInfo.HeaderLike[] | undefined ) => Types.ImageInfo.Header[];

				/** The value of a header by its name (case-insensitive), or null */
				type headerValue = ( headers: Types.ImageInfo.HeaderLike[] | undefined, name: string ) => string | null;

				/** A record from the report of a finished or failed request (a redirected one under its first address) */
				type buildRecord = ( details: Types.ImageInfo.RequestDetails, request: Types.ImageInfo.RequestNote | null ) => Types.ImageInfo.NetworkRecord;

				/** The record of an image downloaded by the button "Load information" */
				type buildDownloadRecord = (
					url: string,
					response: Types.ImageInfo.DownloadResponse,
					accept: string | null,
					startedAt: number,
					completedAt: number,
				) => Types.ImageInfo.NetworkRecord;

				/** Is the response of a document (main_frame, sub_frame) an image? */
				type isImageDocument = ( details: Pick<Types.ImageInfo.RequestDetails, 'type' | 'responseHeaders'> ) => boolean;

				/** The metadata cut to maxChars (default MAX_METADATA_CHARS) characters of JSON */
				type compactMetadata = ( metadata: Types.ImageInfo.Metadata, maxChars?: number ) => Types.ImageInfo.Metadata;

				/** The records with a new one (one per address, the newest last, at most max) */
				type upsertRecord = ( records: Types.ImageInfo.NetworkRecord[], record: Types.ImageInfo.NetworkRecord, max?: number ) => Types.ImageInfo.NetworkRecord[];

				/** The captured metadata into the record of the address (also the final one of a redirected request); null = no such record */
				type attachCapture = (
					records: Types.ImageInfo.NetworkRecord[],
					url: string,
					capture: Types.ImageInfo.CaptureResult,
				) => Types.ImageInfo.NetworkRecord[] | null;

				/** Is the value a stored record? */
				type isRecord = ( value: unknown ) => value is Types.ImageInfo.NetworkRecord;

			}

		}

	}

}

export { };
