/**
 * @file modules/imageInfo/background-script.globals.d.ts
 * @description Global TypeScript declarations for modules/imageInfo/background-script.mjs — the module's background part:
 * recording the requests of images in all tabs (webRequest), in Firefox reading their responses while they load
 * (filterResponseData), and the listing of the images of the page in a tab for imageInfoSandbox (executeScript in all frames),
 * downloading, saving and removing its images.
 */

declare global {

	namespace Types {

		namespace ImageInfo {

			/** The settings and the activity of the module for the listeners; clickOnly — the icon_click mode (the page listed only at a click) */
			type ActiveConfig = Config & { active: boolean; clickOnly: boolean };

			/**
			 * What the frames of the page in the tab found — the input of buildPage() without the records and the status; withRecords: false
			 * without the tab or for a page that is not a web page (the listing gets no records then)
			 */
			type Listing = Omit<PageInput, 'records' | 'status'> & { withRecords: boolean };

			/** The listing made at a click on the extension button (the icon_click mode) with the addresses of its images — only their records are joined later */
			type ClickListing = Listing & { tab: NonNullable<Page['tab']>; urls: string[] };

			/** The webRequest types of the listeners (Firefox also "imageset") */
			type RequestTypes = NonNullable<chrome.webRequest.RequestFilter['types']>;

			/** The records of one tab in memory */
			type TabState = {
				records: NetworkRecord[];

				/** A private window (null = not known yet) — its records are not written */
				incognito: boolean | null;
				saveTimer: ReturnType<typeof setTimeout> | null;
				notifyTimer: ReturnType<typeof setTimeout> | null;

				/** Resolves once the stored records of the tab are read */
				ready: Promise<void>;
			};

			/** The headers of a response for the capture listener */
			type CaptureDetails = Pick<chrome.webRequest.OnHeadersReceivedDetails, 'requestId' | 'url' | 'tabId' | 'type' | 'statusCode' | 'method' | 'responseHeaders'>;

			/** The blocking capture listener (it never changes a request) */
			type CaptureListener = ( details: CaptureDetails ) => chrome.webRequest.BlockingResponse | undefined;

			/** The response body stream from webRequest.filterResponseData() (Firefox, StreamFilter) */
			interface StreamFilter {
				ondata: ( ( event: { data: ArrayBuffer } ) => void ) | null;
				onstop: ( () => void ) | null;
				onerror: ( () => void ) | null;

				/** The description of the error (after onerror) */
				error: string;
				write( data: ArrayBuffer | Uint8Array ): void;
				close(): void;

				/** Stops filtering: the rest of the response goes straight to the page */
				disconnect(): void;
			}

			/** Firefox's chrome.webRequest with filterResponseData() */
			interface WebRequestWithFilter {
				filterResponseData( requestId: string ): StreamFilter;
				onHeadersReceived: {
					addListener( callback: CaptureListener, filter: chrome.webRequest.RequestFilter, extraInfoSpec: string[] ): void;
					removeListener( callback: CaptureListener ): void;
					hasListener( callback: CaptureListener ): boolean;
				};
			}

		}

	}

	namespace Functions {

		namespace ImageInfo {

			namespace BackgroundScript {

				/** Runs in every frame of the tab: imports collectFrame.mjs and lists the images of the frame (null = its document went away meanwhile) */
				type runCollectFrame = ( options: Types.ImageInfo.CollectOptions ) => Promise<Types.ImageInfo.FrameReport | null>;

				/** The webRequest types of images the browser knows */
				type imageTypes = () => Types.ImageInfo.RequestTypes;

				/** Is the webRequest type a document (main_frame, sub_frame)? */
				type isDocumentType = ( type: string ) => boolean;

				/** The pieces of a captured response as one array of total bytes */
				type concat = ( chunks: Uint8Array[], total: number ) => Uint8Array;

				/** The settings and the activity (loaded once) */
				type getConfig = () => Promise<Types.ImageInfo.ActiveConfig>;

				/** Discards the loaded settings and loads them again */
				type invalidateConfig = () => void;

				/** The records of a tab in memory (created on first use, the stored ones read) */
				type tabState = ( tabId: number ) => Types.ImageInfo.TabState;

				/** Is the tab in a private window? */
				type isIncognito = ( tabId: number, state: Types.ImageInfo.TabState ) => Promise<boolean>;

				/** Writes the records of the tab a moment after the last change */
				type scheduleSave = ( tabId: number ) => void;

				/** Tells the extension pages about new records of the tab a moment after the last change */
				type scheduleNotify = ( tabId: number ) => void;

				/** A record of a finished or failed request */
				type record = ( details: Types.ImageInfo.RequestDetails, request: Types.ImageInfo.RequestNote | null ) => void;

				/** Notes a request (the oldest note goes above MAX_PENDING_REQUESTS) */
				type noteRequest = ( requestId: string, note: Types.ImageInfo.RequestNote ) => void;

				/** webRequest.onSendHeaders: notes the Accept header of the request */
				type onSendHeaders = ( details: chrome.webRequest.OnSendHeadersDetails ) => void;

				/** webRequest.onBeforeRedirect: notes the redirect of the request */
				type onBeforeRedirect = ( details: chrome.webRequest.OnBeforeRedirectDetails ) => void;

				/** webRequest.onCompleted and onErrorOccurred (of documents only those that are images; the main frame notes the time of the document) */
				type onDone = ( details: chrome.webRequest.OnCompletedDetails | chrome.webRequest.OnErrorOccurredDetails ) => void;

				/** Registers the listeners of the headers (at the start, or after the permission is granted) */
				type registerListeners = ( when: 'startup' | 'runtime' ) => void;

				/** Is the listener of the headers registered? */
				type isListening = () => boolean;

				/** chrome.webRequest with filterResponseData() (Firefox with the permissions), otherwise null */
				type webRequestWithFilter = () => Types.ImageInfo.WebRequestWithFilter | null;

				/** The metadata of a captured response into the record of its address (or until the record comes) */
				type applyCapture = ( tabId: number, url: string, capture: Types.ImageInfo.CaptureResult ) => void;

				/**
				 * Starts the filter of a response: the page gets every piece right away, a copy of the beginning is parsed (with the
				 * limits of the metadata of the settings)
				 */
				type startCapture = ( webRequest: Types.ImageInfo.WebRequestWithFilter, details: Types.ImageInfo.CaptureDetails, current: Types.ImageInfo.ActiveConfig ) => void;

				/** The blocking webRequest.onHeadersReceived listener of the capture */
				type onCaptureHeaders = Types.ImageInfo.CaptureListener;

				/** Registers the capture listener while the settings want it, removes it otherwise */
				type syncCaptureListener = () => void;

				/** Is the capture listener registered? */
				type isCaptureListening = () => boolean;

				/** Notes the addresses of the images of the listing of the tab (those may be downloaded again); returns the listing */
				type remember = ( page: Types.ImageInfo.Page ) => Types.ImageInfo.Page;

				/** Downloads an image of the tab once more: its headers and the metadata of its beginning into the records */
				type fetchImage = ( tabId: number, url: string, anonymous?: boolean, maxBytes?: number ) => Promise<Types.ImageInfo.FetchedFile>;

				/** The whole file of an image from the frames that use it (frameIds; empty = all) — never the network */
				type readFromFrames = ( tabId: number, url: string, anonymous: boolean, frameIds: number[], accept: string | null ) => Promise<Types.ImageInfo.SaveReadResult>;

				/** The whole file of an image for the thumbnail: from the browser, or with download once more (the records too) */
				type readImage = ( tabId: number, url: string, anonymous: boolean, download: boolean, frameIds: number[] ) => Promise<Types.Messages['IMAGE_INFO_READ']['response']>;

				/** The whole file of an image for saving: from the frames (frameIds; empty = all), otherwise downloaded once more */
				type saveImage = ( tabId: number, url: string, anonymous: boolean, frameIds: number[] ) => Promise<Types.Messages['IMAGE_INFO_SAVE']['response']>;

				/** Runs in a frame of the tab: imports collectFrame.mjs and reads the whole file of an image (null = its document went away meanwhile) */
				type runReadImageFile = ( options: Types.ImageInfo.SaveReadOptions ) => Promise<Types.ImageInfo.SaveReadResult | null>;

				/** Runs in a frame of the tab: imports collectFrame.mjs and keeps the frame reporting its view (false = nothing to follow, null = its document went away meanwhile) */
				type runWatchView = ( options: Types.ImageInfo.WatchOptions ) => Promise<boolean | null>;

				/** Runs in a frame of the tab: imports collectFrame.mjs and removes an image of the last listing from the document (null = it went away meanwhile) */
				type runRemoveImage = ( options: Types.ImageInfo.RemoveOptions ) => Promise<Types.ImageInfo.RemoveResult | null>;

				/** Removes an image of the listing from the page — in the frames that use it (frameIds), REMOVED_CSS into those that need it */
				type removeImage = ( tabId: number, url: string, frameIds: number[] ) => Promise<{ removed: number }>;

				/** The image keys of a report of a frame (an array of texts, at most MAX_VIEW_KEYS)? */
				type isViewKeys = ( value: unknown ) => value is string[];

				/** The frames of the last listing of the tab keep reporting their view (all frames without a known listing) */
				type watchView = ( tabId: number ) => Promise<void>;

				/** Runs in a frame of the tab: imports collectFrame.mjs and shows the marks of the images of the last listing on the page (null = the document went away meanwhile) */
				type runMarkImages = ( options: Types.ImageInfo.MarkOptions ) => Promise<Types.ImageInfo.MarkResult | null>;

				/** The marks of images from an extension page — their shape (the core checked their limits)? */
				type isMarkedImages = ( value: unknown ) => value is Types.ImageInfo.MarkedImage[];

				/** The marks of the images the listing of the tab showed in its frames (and away from the frames that had them); how many elements have a badge */
				type markImages = ( tabId: number, images: Types.ImageInfo.MarkedImage[], source: string ) => Promise<Types.ImageInfo.MarkResult>;

				/** Are the permissions granted (an error = no)? */
				type contains = ( set: Types.PermissionSet ) => Promise<boolean>;

				/** How the module works right now */
				type getStatus = () => Promise<Types.ImageInfo.Status>;

				/** The listing of the images of the page in the tab — the frames listed right now */
				type collectPage = ( tabId: number ) => Promise<Types.ImageInfo.Page>;

				/** The listing for an extension page: the frames right now, in the icon_click mode the listing of the last click */
				type pageFor = ( tabId: number ) => Promise<Types.ImageInfo.Page>;

				/** The listing with the records of the tab joined (only for a web page — its images then remembered for the buttons) */
				type pageOf = ( listing: Types.ImageInfo.Listing, records: Types.ImageInfo.NetworkRecord[], status: Types.ImageInfo.Status ) => Types.ImageInfo.Page;

				/** What the frames of the page in the tab found (the records give the frames the Accept headers, the captured and the redirected addresses) */
				type listTab = ( tabId: number, records: Types.ImageInfo.NetworkRecord[], status: Types.ImageInfo.Status ) => Promise<Types.ImageInfo.Listing>;

				/** A stored listing of a click in the expected shape? */
				type isClickListing = ( value: unknown ) => value is Types.ImageInfo.ClickListing;

				/** The listing of the last click of the tab — from memory, otherwise from the store (null — none) */
				type clickListing = ( tabId: number ) => Promise<Types.ImageInfo.ClickListing | null>;

				/** api.activation.onIconClick(): in the icon_click mode lists the page in the tab of the click (registered synchronously) */
				type onIconClick = ( click: Types.IconClick ) => void;

				/** Lists the page at a click — kept in memory and in the store (not of a private window), the pages told; null for a page that is not a web page */
				type listAtClick = ( tabId: number ) => Promise<Types.ImageInfo.ClickListing | null>;

				/** Is the listing of the click still of the page the tab has (the address without the fragment, no document since the click)? */
				type isClickedPage = ( listing: Types.ImageInfo.ClickListing, url: string | null, documentAt: number | null ) => boolean;

				/** The listing for an extension page in the icon_click mode: the listing of the last click with the current records of its images */
				type clickedPage = ( tabId: number ) => Promise<Types.ImageInfo.Page>;

				/** Did an extension page send the message? */
				type isExtensionPage = ( sender: chrome.runtime.MessageSender ) => boolean;

			}

		}

	}

}

export { };
