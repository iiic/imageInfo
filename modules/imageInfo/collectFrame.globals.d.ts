/**
 * @file modules/imageInfo/collectFrame.globals.d.ts
 * @description Global TypeScript declarations for modules/imageInfo/collectFrame.mjs — the images of one frame of the page
 * (where it uses them: elements and CSS), their Resource Timing and the metadata of the files the browser already has (the
 * HTTP cache of the same origin, data: and blob: addresses), the view of the images for the highlights of imageInfoSandbox and
 * its marks of the properties of images on the page. Runs in the isolated world of the extension in the frame.
 */

declare global {

	namespace Types {

		namespace ImageInfo {

			/** The collectFrame.mjs namespace (the function the background part runs in the frame imports it) */
			type CollectFrameModule = typeof import( './collectFrame.mjs' );

			/** The limits of one listing of a frame */
			type Limits = {

				/** The most elements of the document (and its open shadow roots) that are looked at */
				maxElements: number;

				/** The most usages of images reported */
				maxUsages: number;

				/** How long (ms) the computed CSS of the elements is read at most */
				cssTimeMs: number;

				/** The most files that are read */
				maxFiles: number;

				/** The most bytes of one file that are read (the beginning) */
				maxFileBytes: number;

				/** The time limit (ms) of one file and of all of them */
				fileTimeMs: number;
				totalTimeMs: number;

				/** How many files are read at once */
				concurrency: number;
			};

			/**
			 * What collectFrame() gets: the limits, the Accept header the browser sent for each image address and the addresses
			 * whose whole file the background part already read while it loaded (Firefox) — they are not read again
			 */
			type CollectOptions = {
				limits: Limits;

				/** The limits of the metadata of one file (the settings of the module; without them the defaults of metadata.mjs) */
				metadata?: MetadataLimits;

				/** The Accept headers the images were requested with (by address) */
				accepts: Record<string, string>;

				/** The addresses whose files the background part read while they loaded (Firefox) */
				captured?: string[];

				/** Where the redirected images led (by the address the page asked for) */
				finals?: Record<string, string>;
			};

			/** How the page uses an image: an element (img, input type=image, SVG image, the poster of a video, an icon or a preload link) or CSS */
			type UsageKind = 'img' | 'input' | 'svg' | 'poster' | 'icon' | 'preload' | 'css';

			/** A <source> of the <picture> of an <img> */
			type PictureSource = { srcset: string | null; type: string | null; media: string | null; sizes: string | null };

			/** What gives an <img> or an <input type="image"> its text description (textLabel()) */
			type TextLabel = 'aria-labelledby' | 'aria-label' | 'alt' | 'figcaption' | 'title';

			/** One place where the page uses an image */
			type Usage = {

				/** The key of the image (the address; a data: address shortened with a hash, see imageKey()) */
				key: string;

				/** The address for the listing (a data: address as its key) */
				url: string;
				kind: UsageKind;

				/** tag#id.class of the element */
				element?: string;
				alt?: string | null;

				/** What gives an <img> or an <input type="image"> its text description; null = nothing (the badge "no text alternative"), missing = another kind */
				label?: TextLabel | null;
				title?: string | null;
				src?: string | null;

				/** The width and height attributes of the element (<img>, input type=image, SVG image, video) as written */
				width?: string | null;
				height?: string | null;
				srcset?: string | null;
				sizes?: string | null;
				loading?: string | null;
				decoding?: string | null;
				fetchPriority?: string | null;
				crossOrigin?: string | null;
				referrerPolicy?: string | null;

				/** The type attribute of an icon link */
				type?: string | null;
				naturalWidth?: number | null;
				naturalHeight?: number | null;

				/** Has the <img> loaded (or failed)? */
				complete?: boolean;
				sources?: PictureSource[] | null;

				/** The CSS property (with ::before/::after) the image comes from */
				property?: string;
				renderedWidth?: number;
				renderedHeight?: number;
				inViewport?: boolean;

				/** Added by the background part: the frame the usage is in */
				frameId?: number;
				frameUrl?: string;

				/** The button "Remove from the document" removed the image from this place (removeImage()) — the usage as it was */
				removed?: boolean;
			};

			/** A place of the last listing of the document where removeImage() can remove an image: the element, its usage, the pseudo-element and the property of CSS */
			type RemovablePlace = { element: Element; usage: Usage; pseudo: 'before' | 'after' | null; property: string | null };

			/** An image removed from the document: its full address (a data: address whole) and the usages it had (removed: true) */
			type RemovedImage = { url: string; usages: Usage[] };

			/** What removeImage() gets: the key of the image (its address, the key of a data: address) */
			type RemoveOptions = { key: string };

			/** How many usages of the image removeImage() removed; styled: the document needs REMOVED_CSS (the first time) */
			type RemoveResult = { removed: number; styled: boolean };

			/** What Resource Timing says about the loading of an image (the first entry of the address) */
			type Timing = {
				key: string;
				url: string;
				initiatorType: string;
				startTime: number;
				duration: number;

				/** 0 when the response came from the cache, or the server did not allow the timing to another origin (Timing-Allow-Origin) */
				transferSize: number;
				encodedBodySize: number;
				decodedBodySize: number;
				responseStatus: number | null;
				contentType: string | null;

				/** "cache", "navigational-prefetch", "" (Chrome) */
				deliveryType: string | null;
				nextHopProtocol: string | null;
				renderBlockingStatus: string | null;

				/** How many entries the address has */
				count: number;
			};

			/** What fetchImage() of the background part downloaded: the status and the bytes (complete: not cut at the limit) */
			type FetchedFile = { ok: boolean; status: number; bytes: Uint8Array; complete: boolean; contentType: string | null };

			/** What readImageFile() gets: the key of the image (its address, the key of a data: address), the Accept, without cookies, the limit */
			type SaveReadOptions = { key: string; accept: string | null; anonymous: boolean; maxBytes: number };

			/** The whole file as base64, or why the frame does not have it (tooLarge: more than maxBytes) */
			type SaveReadResult =
				| { data: string; contentType: string | null }
				| { error: 'unknown' | 'crossOrigin' | 'notCached' | 'csp' | 'status' | 'tooLarge' | 'failed' | 'unavailable'; status?: number; detail?: string };

			/** Where the bytes of a file came from: the HTTP cache, a data: or blob: address, the response captured while loading (Firefox) */
			type FileSource = 'cache' | 'data' | 'blob' | 'capture' | 'download';

			/**
			 * Why there is no metadata: another origin (it would have to be downloaded again), not in the cache, the CSP of the page
			 * blocked the read (Firefox), an error status, too many files, the time limit, an error, the capture failed
			 */
			type FileError = 'crossOrigin' | 'notCached' | 'csp' | 'status' | 'tooMany' | 'timeLimit' | 'failed';

			/** The metadata of the file of an image, or why it is not available */
			type FileResult =
				| { source: FileSource; bytes: number; complete: boolean; contentType: string | null; metadata: Metadata }
				| { source: null; error: FileError; status?: number; detail?: string };

			/** Read bytes: whether the whole file, and the type of a data: address */
			type ReadBytes = { bytes: Uint8Array; complete: boolean; contentType?: string };

			/** What of its images a frame reports to the background part (the keys of the images): the visible ones, the one under the pointer */
			type ViewReport = { visible: string[]; hovered: string[] };

			/** What watchView() gets: how long the frame keeps reporting (ms) */
			type WatchOptions = { leaseMs: number };

			/** What the frame follows for the highlights of the listing (collectFrame.mjs) */
			type ViewTracker = {

				/** The elements of the last listing of the document on the page with the keys of their images */
				targets: Map<Element, string[]>;

				/** Follows the viewport while the listing asks (null = the frame does not follow anything) */
				observer: IntersectionObserver | null;

				/** The elements the observer counts in the viewport */
				visible: Set<Element>;

				/** The element under the pointer (null = none) */
				hovered: Element | null;

				/** Where the mouse is, or where the finger tapped last (touch); null = out of the document */
				pointer: { x: number; y: number; touch: boolean } | null;

				/** The end of the lease */
				leaseTimer: ReturnType<typeof setTimeout> | null;

				/** The report waiting for the changes of a moment */
				reportTimer: ReturnType<typeof setTimeout> | null;

				/** The frame of the animation the image under the pointer is looked for in (0 = none) */
				frame: number;

				/** The last report as JSON (null = none since the listing asked) */
				sent: string | null;
			};

			/** A mark of a property of an image (imageInfoSandbox through the core, imageInfo.markImages): its icon, the name of the property and its details (null = none) */
			type Mark = { icon: string; label: string; detail: string | null };

			/** The marks of one image: its file name for the tip and the marks */
			type MarkEntry = { name: string; marks: Mark[] };

			/** The marks of an image for the frame, by the key of the image */
			type MarkImage = MarkEntry & { key: string };

			/** The marks of an image as the core sends them to the background part, by the address of the image (the listing has it so) */
			type MarkedImage = MarkEntry & { url: string };

			/** What markImages() gets: the marks of the images (an empty list takes them away), how long they stay (ms), the name of the module they are from */
			type MarkOptions = { images: MarkImage[]; leaseMs: number; source: string };

			/** How many elements of the frame have a badge */
			type MarkResult = { marked: number };

			/** The badge of a marked element: its element in the shadow root and its marks as JSON (a badge with other marks is built again) */
			type MarkBadge = { element: HTMLElement; json: string };

			/** The marks of imageInfoSandbox in the frame (collectFrame.mjs) */
			type MarkState = {

				/** The marks of the images by their keys (empty = none) */
				images: Map<string, MarkEntry>;

				/** The name of the module the marks are from (the first line of the tip) */
				source: string;

				/** The element of the marks at the end of the document, the layer of the badges and the tip in its closed shadow root (null = none) */
				host: HTMLElement | null;
				layer: HTMLElement | null;
				tip: HTMLElement | null;

				/** The badge whose tip is shown (null = none) */
				tipFor: HTMLElement | null;

				/** The badges by their elements */
				badges: Map<Element, MarkBadge>;

				/** The marked elements the observer counts in the viewport */
				visible: Set<Element>;
				observer: IntersectionObserver | null;
				resizer: ResizeObserver | null;

				/** The end of the lease, the periodic following of the elements, the frame of the animation of the next following (0 = none) */
				leaseTimer: ReturnType<typeof setTimeout> | null;
				positionTimer: ReturnType<typeof setInterval> | null;
				frame: number;
			};

			/** The images of one frame */
			type FrameReport = {
				url: string;
				origin: string;
				title: string;

				/** The type of the document (document.contentType) — "image/…" for an image opened in the tab or in a frame */
				contentType?: string | null;

				/** document.readyState when it was listed — "loading" / "interactive": the page has not loaded everything yet */
				readyState?: DocumentReadyState;

				/** performance.timeOrigin of the document (ms since 1970) */
				timeOrigin: number;
				usages: Usage[];
				timings: Timing[];

				/** The file of every image key that could be read (or why not) */
				files: Record<string, FileResult>;

				/** What the limits cut off: "elements", "usages", "css" */
				truncated: string[];

				/** How many elements had their CSS read */
				cssElements: number;
				elapsedMs: number;
			};

		}

	}

	namespace Functions {

		namespace ImageInfo {

			namespace CollectFrame {

				/** A 32-bit FNV-1a hash as 8 hex digits */
				type hashText = ( text: string ) => string;

				/** The key of an image address (a data: address shortened with its length and hash) */
				type imageKey = ( url: string ) => string;

				/** An absolute http(s)/data:/blob: address of an attribute value, or null */
				type resolveUrl = ( value: string | null | undefined, base: string ) => string | null;

				/** The url(…) addresses of a computed CSS value */
				type cssUrls = ( value: string ) => string[];

				/** Notes a read of this module the CSP of the page blocked */
				type noteViolation = ( event: SecurityPolicyViolationEvent ) => void;

				/** Was the read of the address blocked by the CSP (it waits a moment for the event)? */
				type wasBlocked = ( url: string ) => Promise<boolean>;

				/** The bytes of a data: address (at most limit) */
				type decodeDataUrl = ( url: string, limit: number ) => Types.ImageInfo.ReadBytes;

				/** The body of a response, at most limit bytes */
				type readLimited = ( response: Response, limit: number ) => Promise<Types.ImageInfo.ReadBytes>;

				/** A response of the same origin from the HTTP cache (never the network); null = not cached, "csp" = blocked */
				type cachedResponse = ( url: string, accept: string | null, credentials: RequestCredentials ) => Promise<Response | null | 'csp'>;

				/** Bytes as base64 */
				type toBase64 = ( bytes: Uint8Array ) => string;

				/** The whole file of an image for saving, from what the browser already has */
				type readImageFile = ( options: Types.ImageInfo.SaveReadOptions ) => Promise<Types.ImageInfo.SaveReadResult>;

				/** The file of an image from the HTTP cache (the same origin), a data: or blob: address, with its metadata */
				type readFile = (
					url: string,
					accept: string | null,
					limits: Types.ImageInfo.Limits,
					metadataLimits?: Types.ImageInfo.MetadataLimits
				) => Promise<Types.ImageInfo.FileResult>;

				/** readFile() with the time limit of one file; an error is a result */
				type readFileWithin = (
					url: string,
					accept: string | null,
					limits: Types.ImageInfo.Limits,
					metadataLimits?: Types.ImageInfo.MetadataLimits
				) => Promise<Types.ImageInfo.FileResult>;

				/** tag#id.class of an element (at most 80 characters) */
				type describeElement = ( element: Element ) => string;

				/** The rendered size and whether the element is in the viewport */
				type layout = ( element: Element ) => { renderedWidth: number; renderedHeight: number; inViewport: boolean };

				/** The elements of a document or a shadow root, including the open shadow roots in it */
				type allElements = ( root: Document | ShadowRoot, limit: number, found?: Element[] ) => Element[];

				/** An attribute value (null when missing or empty; at most 2000 characters) */
				type attribute = ( element: Element, name: string ) => string | null;

				/** Does the element have a text (its content or aria-label)? null = no element */
				type hasText = ( element: Element | null ) => boolean;

				/** What gives an <img> or an <input type="image"> its text description: aria-labelledby, aria-label, alt, the <figcaption> of its <figure>, title; null = nothing */
				type textLabel = ( element: Element ) => Types.ImageInfo.TextLabel | null;

				/**
				 * The usages of images into the report, the elements on the page with the keys of their images into targets, every usage with
				 * its element into places; the full address of every key
				 */
				type collectUsages = (
					limits: Types.ImageInfo.Limits,
					report: Types.ImageInfo.FrameReport,
					targets: Map<Element, string[]>,
					places: Map<string, Types.ImageInfo.RemovablePlace[]>
				) => Map<string, string>;

				/** The properties set to none for a removed image of a CSS property */
				type removedProperties = ( property: string ) => string[];

				/** The usages of the images removed from the document into the report (while the page does not use them again), their full addresses into fullUrls */
				type addRemovedUsages = ( report: Types.ImageInfo.FrameReport, fullUrls: Map<string, string> ) => void;

				/** Removes an image of the last listing from the document */
				type removeImage = ( options: Types.ImageInfo.RemoveOptions ) => Types.ImageInfo.RemoveResult;

				/** Removes the image from one place: "element" / "document" (the rules of the document are needed too) / null (not removed) */
				type removePlace = ( place: Types.ImageInfo.RemovablePlace ) => 'element' | 'document' | null;

				/** REMOVED_CSS into an open shadow root; false = not possible */
				type adoptRemovedCss = ( root: ShadowRoot ) => boolean;

				/** The Resource Timing of the images into the report, by address */
				type collectTimings = ( report: Types.ImageInfo.FrameReport ) => Map<string, Types.ImageInfo.Timing>;

				/** The images of this frame */
				type collectFrame = ( options: Types.ImageInfo.CollectOptions ) => Promise<Types.ImageInfo.FrameReport>;

				/** The elements of the new listing for the highlights (the frame follows them while the listing asks) */
				type setViewTargets = ( targets: Map<Element, string[]> ) => void;

				/** Reports the view of the document for leaseMs more (and the current state right away); false = nothing to follow */
				type watchView = ( options: Types.ImageInfo.WatchOptions ) => boolean;

				/** Starts following the viewport and the pointer */
				type startView = () => void;

				/** Stops following; report: an empty report when something was highlighted */
				type stopView = ( report: boolean ) => void;

				/** The document goes away — it stops with an empty report */
				type onViewPageHide = () => void;

				/** The elements in the viewport by the observer */
				type onViewIntersections = ( entries: IntersectionObserverEntry[] ) => void;

				/** Where the mouse is (or the finger tapped) */
				type onViewPointer = ( event: PointerEvent ) => void;

				/** Scrolling under the mouse that stays still */
				type onViewScroll = () => void;

				/** Looks for the image under the pointer in the next frame of the animation */
				type scheduleHover = () => void;

				/** The topmost element of the listing at the point, unless another part of the page covers it (null = none) */
				type hoveredTarget = ( x: number, y: number ) => Element | null;

				/** The elements at the point from the top, also in open shadow roots */
				type pointStack = ( root: Document | ShadowRoot, x: number, y: number, depth: number ) => Element[];

				/** The parent element, the host from the top of a shadow root */
				type composedParent = ( node: Element ) => Element | null;

				/** Is node the element or inside it (also through shadow roots)? */
				type composedContains = ( element: Element, node: Element ) => boolean;

				/** Is the nearest common ancestor of the elements something else than <body> and the root? */
				type sharesBox = ( a: Element, b: Element ) => boolean;

				/** The report of the view in a moment (only a changed one goes) */
				type queueViewReport = () => void;

				/** The keys of the visible images and of the image under the pointer */
				type viewState = () => Types.ImageInfo.ViewReport;

				/** Sends the report to the background part */
				type postViewReport = ( state: Types.ImageInfo.ViewReport ) => void;

				/** The elements with the marked images they show (in the order of their keys), at most MARK_MAX_ELEMENTS */
				type markGroups = <E>( targets: Map<E, string[]>, images: Map<string, Types.ImageInfo.MarkEntry> ) => Map<E, Types.ImageInfo.MarkEntry[]>;

				/** The icons of a badge — of all marks of its images, each once */
				type markIcons = ( images: Types.ImageInfo.MarkEntry[] ) => string[];

				/** The marks of the images of the last listing for leaseMs more (an empty list takes them away); how many elements have a badge */
				type markImages = ( options: Types.ImageInfo.MarkOptions ) => Types.ImageInfo.MarkResult;

				/** The badges by the marks and the elements of the last listing; how many elements have one */
				type renderMarks = () => number;

				/** The layer of the badges (created when needed, with its observers and listeners); null = not possible */
				type markLayer = () => HTMLElement | null;

				/** Takes the marks away */
				type clearMarks = () => void;

				/** Removes the element of the marks with its badges, observers, listeners and timers */
				type stopMarkLayer = () => void;

				/** The marked elements in the viewport by the observer */
				type onMarkIntersections = ( entries: IntersectionObserverEntry[] ) => void;

				/** The badges follow their elements in the next frame of the animation */
				type scheduleMarkPositions = () => void;

				/** Every badge at the corner of its element, shown while the element is visible */
				type positionMarks = () => void;

				/** The rectangle of a marked element while it is visible and not covered (null = hidden) */
				type markedRect = ( element: Element ) => DOMRect | null;

				/** Does another part of the page cover the element at the point (the badges do not count)? */
				type markCovered = ( element: Element, x: number, y: number ) => boolean;

				/** An element of the shadow root of the marks with a class and a text */
				type markText = <K extends keyof HTMLElementTagNameMap>( tag: K, className: string, text: string ) => HTMLElementTagNameMap[K];

				/** A badge with the icons of the marks of the images of its element (the tip under the pointer) */
				type createBadge = ( images: Types.ImageInfo.MarkEntry[] ) => HTMLDivElement;

				/** Shows the tip of the badge with the details of the marks */
				type showMarkTip = ( badge: HTMLElement, images: Types.ImageInfo.MarkEntry[] ) => void;

				/** The tip under (or above) its badge within the viewport */
				type placeMarkTip = ( badge: HTMLElement ) => void;

				/** Hides the tip */
				type hideMarkTip = () => void;

			}

		}

	}

}

export { };
