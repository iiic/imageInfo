/**
 * @file modules/imageInfo/page.globals.d.ts
 * @description Global TypeScript declarations for modules/imageInfo/page.mjs — the listing of the images of a page for
 * imageInfoSandbox: the reports of the frames joined with the network records of the tab (pure functions).
 */

declare global {

	namespace Types {

		namespace ImageInfo {

			/** How the module works right now (the background part says) */
			type Status = {
				browser: 'chrome' | 'firefox';

				/** Recording the headers: on, turned off in Settings, the webRequest permission or the page access is missing */
				headers: 'on' | 'off' | 'noPermission';

				/** Is the listener of the headers registered? */
				listening: boolean;

				/** Firefox: was it registered at the start of the background page (it wakes it up), or only after a permission was granted? */
				persistent: boolean;

				/** Does the extension have scripting and the page access (the listing of the frames)? */
				pageAccess: boolean;

				/** Reading the files of other origins while they load (Firefox only) */
				capture: 'on' | 'off' | 'noPermission' | 'unsupported';
				captureListening: boolean;

				/** The icon_click mode: the page is listed only at a click on the extension button (the listing is of that moment) */
				clickOnly: boolean;
			};

			/**
			 * Why the listing has no frames: no tab, not a web page, no page access, the injection failed, no click on the extension
			 * button listed the page of the tab yet (the icon_click mode — also when the tab has loaded another page since then)
			 */
			type PageError = 'noTab' | 'notWebPage' | 'noAccess' | 'inject' | 'notClicked';

			/** The record of an image without the captured metadata (that is in the file of the image) */
			type NetworkInfo = Omit<NetworkRecord, 'capture'>;

			/** One image of the page */
			type ImageEntry = {
				key: string;
				url: string;

				/** "https", "http", "data", "blob" */
				scheme: string;

				/** The same origin as the page (null for data:, blob: or an unknown page) */
				sameOrigin: boolean | null;

				/** Where the page uses it (at most MAX_USAGES_PER_IMAGE, the count in usageCount) */
				usages: Usage[];
				usageCount: number;
				timing: Timing | null;
				network: NetworkInfo | null;
				file: FileResult | null;
			};

			/** A frame of the page in the listing */
			type FrameSummary = {
				frameId: number;
				url: string;
				origin: string;

				/** The type of the document (document.contentType) */
				contentType: string | null;

				/** document.readyState when it was listed (null = not known) */
				readyState: DocumentReadyState | null;
				usages: number;
				truncated: string[];
				cssElements: number;
				elapsedMs: number;
			};

			/** The listing of the images of the page in the tab */
			type Page = {
				tab: { tabId: number; url: string | null; title: string | null } | null;
				status: Status;
				error: PageError | null;
				errorDetail: string | null;
				collectedAt: number;

				/**
				 * When the document of the tab started: performance.timeOrigin of its main frame, without the frames the last response
				 * of the main frame (null = not known) — the same for the whole life of the document, also after history.pushState()
				 */
				documentAt: number | null;
				frames: FrameSummary[];
				images: ImageEntry[];
			};

			/** A frame report as executeScript returned it */
			type FrameResult = { frameId: number; report: FrameReport };

			/** What buildPage() joins */
			type PageInput = {
				tab: Page['tab'];
				frames: FrameResult[];
				records: NetworkRecord[];
				status: Status;
				collectedAt: number;

				/** When the document of the tab started (without the frames: the last response of the main frame) */
				documentAt?: number | null;
				error?: PageError | null;
				errorDetail?: string | null;
			};

		}

	}

	namespace Functions {

		namespace ImageInfo {

			namespace Page {

				/** The origin of an http(s) address, otherwise null */
				type originOf = ( url: string | null | undefined ) => string | null;

				/** The file result of the metadata captured while loading */
				type fromCapture = ( capture: Types.ImageInfo.CaptureResult ) => Types.ImageInfo.FileResult;

				type withoutCapture = ( record: Types.ImageInfo.NetworkRecord ) => Types.ImageInfo.NetworkInfo;

				/** The listing of the images of the page */
				type buildPage = ( input: Types.ImageInfo.PageInput ) => Types.ImageInfo.Page;

			}

		}

	}

}

export { };
