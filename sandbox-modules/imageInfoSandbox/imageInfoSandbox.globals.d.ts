/**
 * @file sandbox-modules/imageInfoSandbox/imageInfoSandbox.globals.d.ts
 * @description Global TypeScript declarations for sandbox-modules/imageInfoSandbox/imageInfoSandbox.mjs — the listing of all
 * images of the current page with where the page uses them, how they loaded, their HTTP response headers and the metadata of
 * their files (EXIF, GPS, XMP, IPTC, ICC, the structure of the format), as an uploaded package the extension brings; the data
 * from the background part of imageInfo through the functions outside the sandbox imageInfo.getPage and imageInfo.onChange, the
 * highlights of the images the page shows and the user points at through imageInfo.onView, the marks of the properties of images
 * on the page itself through imageInfo.markImages.
 */

declare global {

	interface HTMLElementTagNameMap {
		'extension-image-info-sandbox': Classes.ExtensionImageInfoSandbox;
	}

	namespace Functions {

		namespace ImageInfoSandbox {

			namespace Element {

				/** this.api of the element as the sandbox gives it (with capabilities) */
				type sandboxApi = ( element: Classes.ExtensionImageInfoSandbox ) => Types.SandboxModuleApi;

				/** The text of an error */
				type errorText = ( err: unknown ) => string;

				/** A serial number with its kind in a few words ("Camera S/N …", "Lens S/N …") */
				type serialLabel = ( ref: Types.ImageInfoSandbox.SerialRef ) => string;

				/** Does an <img> of this frame load a blob: address (not in the sandbox frame of Firefox)? Decided once */
				type canShowBlobImages = () => Promise<boolean>;

				/** The bytes of a base64 text */
				type fromBase64 = ( data: string ) => Uint8Array<ArrayBuffer>;

				/** The key of a group of the metadata of an image (its expanded state) */
				type groupKey = ( imageKey: string, groupId: string ) => string;

				/** An element with a class and a text */
				type create = <K extends keyof HTMLElementTagNameMap>( tag: K, className?: string, text?: string ) => HTMLElementTagNameMap[K];

				/** An http(s) address as a link to a new tab, anything else as text */
				type createUrlNode = ( url: string, text?: string ) => HTMLElement;

				/** A section of the details: a heading and its content */
				type section = ( title: string, ...content: Node[] ) => HTMLElement;

				/** A definition list of [term, value] rows (an empty value is left out) */
				type definitions = ( rows: [ string, string | Node | null | undefined ][] ) => HTMLDListElement;

				/** A table of [name, value] rows; highlight marks some of them */
				type entriesTable = ( rows: [ string, string ][], highlight?: ( name: string ) => boolean ) => HTMLTableElement;

				/** "yes" / "no" in the language of the interface, null stays null */
				type yesNo = ( value: boolean | null ) => string | null;

				/** A size in pixels "1 920 × 1 080" */
				type size = ( width: number, height: number ) => string;

				/** The format, the size in pixels and the size of the file of an image for its line */
				type facts = ( image: Types.ImageInfo.ImageEntry ) => string;

				/** The badges of an image: [kind of the look, text, the title (the text of a badge that is only a sign)]; those of the properties with a notice by its "badge" */
				type chips = ( image: Types.ImageInfo.ImageEntry, notices: Types.ImageInfoSandbox.Notices, context: Types.ImageInfoSandbox.NoticeContext ) => [ string, string, string? ][];

				/** The badges of chips() as the elements of a line */
				type chipsElement = ( list: [ string, string, string? ][] ) => HTMLSpanElement;

				/** The keys of the recorded images as one text (the list of the page is drawn again when it changes) */
				type recordedSignature = ( recorded: ReadonlyMap<string, Types.ImageInfoSandbox.RecordEntry> ) => string;

				/** The summary of the metadata of an image (null = no metadata) */
				type summaryOf = ( image: Types.ImageInfo.ImageEntry ) => Types.ImageInfo.MetadataSummary | null;

				/** The details of a property of an image for its mark on the page (null = none) */
				type noticeDetail = ( image: Types.ImageInfo.ImageEntry, context: Types.ImageInfoSandbox.NoticeContext ) => string | null;

				/** The mark of a property of an image on the page: the icon, the name without the icon, the details — within the limits of the core */
				type noticeMark = ( image: Types.ImageInfo.ImageEntry, tag: Enums.ImageInfoSandbox.NoticeTag, context: Types.ImageInfoSandbox.NoticeContext ) => Types.ImageInfo.Mark;

			}

		}

	}

	namespace Classes {

		/**
		 * The listing of the images of the page in the sandbox. Type checking sees BaseElement of sdk.mjs (the module imports
		 * "../../sdk.mjs"); in the sandbox it is the BaseElement of the sandbox SDK.
		 */
		class ExtensionImageInfoSandbox extends BaseElement {

			/** The last listing (imageInfo.getPage), null = none yet */
			_result: Types.SandboxImageInfoPage | null;

			/** The last drawn listing as JSON (without the time of the listing) — the same one is not drawn again */
			_shownJson: string | null;

			/** Why there is no listing (the function is denied, the listing failed), null = none */
			_error: string | null;

			/** The states of the declared functions outside the sandbox */
			_states: Record<string, Enums.SandboxCapabilityState>;

			/** The keys of the expanded images (they stay expanded after another listing) */
			_open: Set<string>;

			/** The expanded groups of the metadata (groupKey()) — they stay expanded after another listing */
			_openGroups: Set<string>;

			/** The key of the image expanded as the only one in the list (null = the list has another number of images) */
			_expandedSingle: string | null;

			/** The image the list expanded itself as the only one, and the groups of its metadata it expanded with it — collapsed again once the list has more images; null once the user collapses it */
			_autoOpened: { key: string; groups: string[] } | null;

			/** The tab and the address of the image alone in the tab the page was scrolled to this listing for (null = not an image) */
			_scrolledFor: string | null;

			/** The keys of the images being downloaded by the button "Load information" */
			_fetching: Set<string>;

			/** The searched text */
			_filter: string;
			_sort: Enums.ImageInfoSandbox.SortOrder;

			/** Ignoring small images and their size (the settings of the module) */
			_small: Types.ImageInfoSandbox.SmallImages;

			/** Hiding the images "not on the page" (the setting of the module) */
			_hideUnused: boolean;

			/** Cleaning dynamically — hiding the images listed before the page changed its address (the setting of the module) */
			_cleanDynamic: boolean;

			/** Only the images with an important property (the setting of the module) */
			_onlyImportant: boolean;

			/** The tab, the document and the address of the last listing and the images listed before the last change of the address */
			_cleaning: Types.ImageInfoSandbox.Cleaning;

			/** The notices about the properties of images — a badge, never hiding, a notification (the setting of the module) */
			_notices: Types.ImageInfoSandbox.Notices;

			/** The limits of the notices — an oversized image, a large file (the settings of the module) */
			_limits: Types.ImageInfoSandbox.NoticeLimits;

			/** The document of the last notification check and the keys announced for it as far as this listing knows (noticeDocument(), newNotices()) */
			_announced: { document: string | null; keys: Set<string> };

			/** The notification checks one after another */
			_announcing: Promise<void>;

			/** Why the last notification could not be shown (a line of the status), null = none */
			_notifyProblem: string | null;

			/** The marks of the images on the page last computed (imageInfo.markImages) and them as JSON — sent again only after a change */
			_markImages: Types.ImageInfo.MarkedImage[];
			_markJson: string;

			/** The requests of the marks one after another */
			_marking: Promise<void>;

			/** Sends the marks again while there are some (MARK_RENEW_MS) */
			_markTimer: ReturnType<typeof setInterval> | null;

			/** Why the last marks could not be shown on the page (a line of the status), null = none */
			_markProblem: string | null;

			/** A clicked notification waiting for the listing of its document (until = the time it is forgotten), null = none */
			_noticeOpen: ( Types.ImageInfoSandbox.NoticeClick & { until: number } ) | null;

			/** The images of the last clicked notification — shown even when they would be hidden, while the listing has that document */
			_noticeShown: { document: string; keys: Set<string> } | null;

			/** Sequence number of the last listing — an older one that ends later is not drawn */
			_token: number;

			/** A listing is running; a change during it asks once more right after it */
			_loading: boolean;
			_again: boolean;
			_timer: ReturnType<typeof setTimeout> | null;

			/** A change came while the surface was hidden (the focus mode) */
			_hiddenChange: boolean;

			/** Unsubscribing tabs.onChange and imageInfo.onChange while the listing follows the page */
			_stopTabs: ( () => void ) | null;
			_stopChanges: ( () => void ) | null;

			/** Unsubscribing imageInfo.onView while the listing is shown */
			_stopView: ( () => void ) | null;

			/** The keys of the images visible on the page and of the one under the pointer (imageInfo.onView) */
			_view: { visible: Set<string>; hovered: Set<string> };

			/** The lines of the list by the keys of their images (the highlights) */
			_items: Map<string, HTMLLIElement>;

			/** The side panel outside LIVE_SPEC: it follows only another tab and a new address */
			_tabsOnly: boolean;

			/** ICON_CLICK_SPEC outside the popup: it lists the page only after a click on the extension button (and with Refresh) */
			_clickOnly: boolean;

			/** Unsubscribing api.activation.onIconClick() while _clickOnly */
			_stopClicks: ( () => void ) | null;

			/** The tab and the address of the page listed again while it loads, and how many times so far */
			_loadingKey: string | null;
			_loadingRetries: number;

			_statusEl: HTMLDivElement;
			_toolbarEl: HTMLDivElement;
			_summaryEl: HTMLSpanElement;
			_searchEl: HTMLInputElement;
			_sortEl: HTMLSelectElement;
			_refreshEl: HTMLButtonElement;

			/** The checkbox "Ignore small images" in the toolbar and its text with the size */
			_smallEl: HTMLInputElement;
			_smallTextEl: HTMLSpanElement;

			/** The checkbox "Hide images not on the page" in the toolbar */
			_unusedEl: HTMLInputElement;

			/** The checkbox "Clean dynamically" in the toolbar */
			_cleanEl: HTMLInputElement;

			/** The checkbox "Only important" in the toolbar */
			_importantEl: HTMLInputElement;
			_listEl: HTMLOListElement;

			/** The newest permanent records (newest first, at most MAX_PERMANENT_RECORDS) and how many the module has */
			_records: Types.ImageInfoSandbox.RecordEntry[];
			_recordCount: number;

			/** The permanently recorded images as far as the listing knows them: the key of the image → its record */
			_recorded: Map<string, Types.ImageInfoSandbox.RecordEntry>;

			/** Have the records been loaded once (automatic recording waits for it — it must know the removed ones)? */
			_recordsReady: boolean;

			/** The load of the records running now, and a change during it (load once more) */
			_recordsLoad: Promise<void> | null;
			_recordsAgain: boolean;

			/** The requests to record one after another */
			_recording: Promise<void>;

			/** The keys of the images the button is recording right now */
			_recordingKeys: Set<string>;

			/** The keys of the images automatic recording already tried in this listing (each once) */
			_recordTried: Set<string>;

			/** The keys of the images whose record the user removed (DISMISSED_STATE_KEY) — automatic recording leaves them out */
			_dismissed: Set<string>;

			/** Why automatic recording failed (a line of the status), null = none */
			_recordProblem: string | null;

			/** The ids of the expanded records, and of the records being removed right now */
			_openRecords: Set<number>;
			_removingRecords: Set<number>;

			/** What the expanded section shows as JSON (null = collapsed or hidden) — built again only after a change */
			_recordsShown: string | null;

			/** The recorded images the list of the page was last drawn with (recordedSignature()) */
			_listRecorded: string;

			/** How the button "Record permanently" of an image ended (the note — kept while the image is recorded) */
			_recordNotes: Map<string, string>;

			/** The section "Permanently recorded images (N)", its summary and the list of the records */
			_recordsEl: HTMLDetailsElement;
			_recordsTitleEl: HTMLElement;
			_recordsListEl: HTMLOListElement;

			/** The serial numbers (with their kind — serialRefKey()) of the expanded groups of the records (they stay expanded after the records are drawn again) */
			_openSerials: Set<string>;

			/** The permanent records of the serial numbers of both kinds (api.data.findByKey() — one key for both) — read once until the records change */
			_serialRecords: Map<string, Promise<Types.ImageInfoSandbox.RecordEntry[]>>;

			/** The matches of the serial numbers of the listed page: the key of the image → its match (serialMatches()) */
			_matches: Map<string, Types.ImageInfoSandbox.SerialMatch>;

			/** The matches as JSON (the keys, the serial numbers, the ids of the records) — the list is drawn again only after a change */
			_matchJson: string;

			/** The searches of the matches one after another */
			_matching: Promise<void>;

			/** A notification about a found match of the serial number of the camera, of the lens (the settings MATCH_NOTIFY_KEYS) */
			_matchNotify: Record<Enums.ImageInfoSandbox.SerialKind, boolean>;

			/** The document of the last notification of the matches and the keys announced for it as far as this listing knows (newMatches()) */
			_matchAnnounced: { document: string | null; keys: Set<string> };

			/** Why the last notification of the matches could not be shown (a line of the status), null = none */
			_matchProblem: string | null;

			static override get observedAttributes(): string[];
			override connectedCallback(): void;
			override disconnectedCallback(): void;
			override connectedMoveCallback(): void;
			override adoptedCallback(): void;
			override attributeChangedCallback( name: string, oldValue: string | null, newValue: string | null ): void;
			override init( options: Types.ModuleInitOptions ): Promise<void>;

			/** Has the user allowed the function outside the sandbox? */
			_allowed( capability: string ): boolean;

			/** The settings of the listing — the checkboxes of the toolbar (small images, not on the page, cleaning dynamically) into it, the notices; whether they changed */
			_loadSettings(): Promise<boolean>;

			/** The settings changed in Settings — the settings of the listing, and follow the page or not by the mode */
			_onSettingsChanged(): Promise<void>;

			/** The activation mode after a change in Settings */
			_setMode( mode: Enums.ActivationMode ): void;

			/**
			 * Follows the page by the mode (LIVE_SPEC everything, ICON_CLICK_SPEC outside the popup the clicks on the extension button,
			 * the side panel otherwise another tab and a new address)
			 */
			_applyMode(): void;

			/** Starts or stops following new images of the page and another tab or a new address */
			_follow( images: boolean, tabs: boolean ): void;

			/** Starts or stops listing the page after every click on the extension button (api.activation.onIconClick()) */
			_followClicks( on: boolean ): void;

			/** Starts or stops following the visible images and the one under the pointer (imageInfo.onView, when allowed) */
			_followView( on: boolean ): void;

			/** The view from imageInfo.onView as the highlights of the lines (anything else = none) */
			_showView( view: unknown ): void;

			/** The highlights of one line by the view */
			_highlight( item: HTMLLIElement, key: string ): void;

			/** The side panel outside LIVE_SPEC: a listing of a page still loading again in a moment (a few times) */
			_repeatWhileLoading( page: Types.ImageInfo.Page | null ): void;

			/** A listing in a moment (or once the surface is visible in the focus mode) */
			_scheduleRefresh(): void;

			/** Asks for the listing of the page */
			_refresh(): Promise<void>;

			/** A line of the status, optionally with a button that opens Settings */
			_statusLine( text: string, kind?: string, options?: boolean ): void;

			/** The status, the summary and the list of the last listing */
			_render(): void;

			/** A notification about the images of the page with a property whose "Send a notification" is on (after the previous check) */
			_announce( page: Types.ImageInfo.Page | null ): void;

			/** The notification check: the images not announced for the document yet (api.sessionState) and one silent notification */
			_announceNow( page: Types.ImageInfo.Page | null ): Promise<void>;

			/** Looks for the matches of the serial numbers of the page with the permanent records (after the previous search) */
			_findMatches( page: Types.ImageInfo.Page | null ): void;

			/** One search of the matches: the records of the serial numbers of the page, the list again after a change, the notification */
			_findMatchesNow( page: Types.ImageInfo.Page | null ): Promise<void>;

			/** The permanent records of a serial number (read once until the records change; a failure = none) */
			_recordsOfSerial( serial: string ): Promise<Types.ImageInfoSandbox.RecordEntry[]>;

			/** The notification of the matches of the kinds whose setting is on (MATCH_NOTIFY_KEYS) not announced for the document yet */
			_announceMatches( page: Types.ImageInfo.Page | null, found: Types.ImageInfoSandbox.SerialMatch[] ): Promise<void>;

			/** The section "Serial number match" of an image (null = no match): the matching records */
			_matchSection( image: Types.ImageInfo.ImageEntry ): HTMLElement | null;

			/** The marks of the images of the page on the page itself (the column "Show on the page"); sent when they change */
			_mark( page: Types.ImageInfo.Page | null ): void;

			/** Sends the marks again every MARK_RENEW_MS while there are some and the surface is visible */
			_renewMarks(): void;

			/** Sends the current marks (after the previous request) */
			_sendMarks(): void;

			/** The request of the marks; a failure is a line of the status until one goes through */
			_sendMarksNow(): Promise<void>;

			/** A click on a notification of the listing (the side panel, the floating window): its tab to the front, its images open */
			_onNoticeClick( click: unknown ): void;

			/** Expands the images of the clicked notification once the listing has its document and scrolls to the first; whether it did */
			_applyNoticeOpen(): boolean;

			/** An image alone in the tab: the side panel or the floating window scrolls to this listing (once for the image) */
			_scrollToImagePage( page: Types.ImageInfo.Page ): void;

			/** What the listing of the page lacks and why */
			_renderPageStatus( page: Types.ImageInfo.Page ): void;

			/** The images the list shows (the search, without the cleaned, unused and small ones when they are hidden — except the kept ones), the keys of those shown only because they are under the pointer, and how many of each it leaves out */
			_shownImages( page: Types.ImageInfo.Page ): { shown: Types.ImageInfo.ImageEntry[]; revealed: string[]; small: number; unused: number; cleared: number; unimportant: number };

			/** The number of images, their size and the time of the listing */
			_renderSummary(): void;

			/** The filtered and sorted list of the images */
			_renderList(): void;

			/** One image: its line and the details built when it is expanded */
			_createItem( image: Types.ImageInfo.ImageEntry, index: number ): HTMLLIElement;

			/** The details of an image */
			_createBody( image: Types.ImageInfo.ImageEntry ): HTMLDivElement;

			/** The checkbox "Anonymously" at the buttons (off by default, for the life of the listing): downloads and saves without cookies */
			_fetchAnonymous: boolean;

			/** The keys of the images being saved */
			_saving: Set<string>;

			/** The keys of the images being removed from the page right now */
			_removing: Set<string>;

			/** The keys of the images being blocked permanently right now */
			_blocking: Set<string>;

			/** The thumbnails: the key of the image → a blob: (Firefox: data:) address of its file (at most MAX_THUMBNAILS, the oldest go) */
			_thumbs: Map<string, string>;

			/** The keys of the images whose file is being read for the thumbnail */
			_thumbLoading: Set<string>;

			/** The keys of the images the browser turned out not to have — the button "Show" instead */
			_thumbMissing: Set<string>;

			/** The error of the last "Show" of an image */
			_thumbErrors: Map<string, string>;

			/** The section "Thumbnail" above "On the page" */
			_thumbnailSection( image: Types.ImageInfo.ImageEntry ): HTMLElement;

			/** Fills the box of the thumbnail: the image, "Loading…", the button "Show" or why it cannot be shown */
			_fillThumbnail( image: Types.ImageInfo.ImageEntry, box: HTMLDivElement ): void;

			/** Reads the file for the thumbnail (imageInfo.readImage; download = once more from the network) */
			_loadThumbnail( image: Types.ImageInfo.ImageEntry, download: boolean ): Promise<void>;

			/** The buttons of an image: "Load information" (the headers or the metadata missing), "Save" / "Download", "Anonymously" */
			_fetchSection( image: Types.ImageInfo.ImageEntry ): HTMLDivElement;

			/** Labels a button that acts by "anonymously" (the prefix 🕵 while it is checked) */
			_labelButton( button: HTMLButtonElement, text: string ): void;

			/** The busy text of such a button (without the prefix; the label is kept for _labelButton()) */
			_busyButton( button: HTMLButtonElement, text: string ): void;

			/** Saves the image as a download (imageInfo.saveImage); where it came from or an error goes into the note */
			_saveImage( image: Types.ImageInfo.ImageEntry, button: HTMLButtonElement, note: HTMLSpanElement, fromBrowser: boolean ): Promise<void>;

			/** The button "Remove from the document" of the image (disabled once it is removed) */
			_removeButton( image: Types.ImageInfo.ImageEntry, note: HTMLSpanElement ): HTMLButtonElement;

			/** Removes the image from the page (imageInfo.removeImage) and lists the page again; nothing removed or an error goes into the note */
			_removeImage( image: Types.ImageInfo.ImageEntry, button: HTMLButtonElement, note: HTMLSpanElement ): Promise<void>;

			/** The button "Block the image permanently" of an http(s) image */
			_blockButton( image: Types.ImageInfo.ImageEntry, note: HTMLSpanElement ): HTMLButtonElement;

			/** Blocks the image permanently (imageInfo.blockImage — the rule of the blocked images of declarativeNetRequest); the result or why not goes into the note */
			_blockImage( image: Types.ImageInfo.ImageEntry, button: HTMLButtonElement, note: HTMLSpanElement ): Promise<void>;

			/** Downloads the image once more (imageInfo.fetchImage) and lists the page again; an error goes into the note */
			_fetchImage( image: Types.ImageInfo.ImageEntry, button: HTMLButtonElement, note: HTMLSpanElement ): Promise<void>;
			_addressSection( image: Types.ImageInfo.ImageEntry ): HTMLElement;
			_usagesSection( image: Types.ImageInfo.ImageEntry ): HTMLElement;
			_loadingSection( image: Types.ImageInfo.ImageEntry ): HTMLElement;

			/** The headers of an image (record: of a permanent record — without the status of the listed page) */
			_headersSection( image: Types.ImageInfo.ImageEntry, record?: boolean ): HTMLElement;
			_metadataSection( image: Types.ImageInfo.ImageEntry ): HTMLElement;

			/** Loads the newest permanent records, their count and the removed images, and draws them (one load at a time) */
			_loadRecords(): Promise<void>;

			/** The records changed here — tells the other surfaces (RECORDS_STATE_KEY) and loads them again */
			_recordsChanged(): Promise<void>;

			/** Records the images permanently (after the previous requests); how each ended */
			_record( requests: Types.ImageInfoSandbox.RecordRequest[], page: Types.ImageInfo.Page | null ): Promise<Types.ImageInfoSandbox.RecordOutcome[]>;

			/** One request to record: no new record for an image that has one (the listing knows it, or the core has it under its key) */
			_recordNow( requests: Types.ImageInfoSandbox.RecordRequest[], page: Types.ImageInfo.Page | null ): Promise<Types.ImageInfoSandbox.RecordOutcome[]>;

			/** Automatic recording of the images of the page with a property whose "record" is on (each once for the listing) */
			_autoRecord( page: Types.ImageInfo.Page | null ): void;

			/** The button "Record permanently" of an image (disabled once it is recorded) */
			_recordButton( image: Types.ImageInfo.ImageEntry, note: HTMLSpanElement ): HTMLButtonElement;

			/** Records the image permanently by the button; how it ended goes into the note */
			_recordImage( image: Types.ImageInfo.ImageEntry, button: HTMLButtonElement, note: HTMLSpanElement ): Promise<void>;

			/** The section "Permanently recorded images (N)" — hidden without records, the records while it is expanded */
			_renderRecords(): void;

			/** What the properties of the image of a record need: the limits now, whether its page was https */
			_recordContext( record: Types.ImageInfoSandbox.PermanentRecord ): Types.ImageInfoSandbox.NoticeContext;

			/** One permanent record: its line and the details built when it is expanded */
			_createRecordItem( entry: Types.ImageInfoSandbox.RecordEntry ): HTMLLIElement;

			/** The records of one serial number (a group of the section): its line and its records built when it is expanded */
			_createRecordGroup( serial: Types.ImageInfoSandbox.SerialRef, entries: Types.ImageInfoSandbox.RecordEntry[] ): HTMLLIElement;

			/** The details of a permanent record: the button "Remove the record", the record and the sections of the image */
			_createRecordBody( entry: Types.ImageInfoSandbox.RecordEntry ): HTMLDivElement;

			/** When, where and why the image was recorded and its properties then */
			_recordSection( record: Types.ImageInfoSandbox.PermanentRecord ): HTMLElement;

			/** Removes a permanent record (automatic recording then leaves the image out); a failure goes into the note */
			_removeRecord( entry: Types.ImageInfoSandbox.RecordEntry, button: HTMLButtonElement, note: HTMLSpanElement ): Promise<void>;

		}

		namespace ExtensionImageInfoSandbox {

			/** Instance properties (without methods); the base of the class is cast to them in JS — see Types.WithFields */
			type Fields = Pick<
				ExtensionImageInfoSandbox,
				| '_result'
				| '_shownJson'
				| '_error'
				| '_states'
				| '_open'
				| '_openGroups'
				| '_expandedSingle'
				| '_autoOpened'
				| '_scrolledFor'
				| '_fetching'
				| '_filter'
				| '_sort'
				| '_small'
				| '_hideUnused'
				| '_unusedEl'
				| '_cleanDynamic'
				| '_onlyImportant'
				| '_cleaning'
				| '_notices'
				| '_limits'
				| '_announced'
				| '_announcing'
				| '_notifyProblem'
				| '_markImages'
				| '_markJson'
				| '_marking'
				| '_markTimer'
				| '_markProblem'
				| '_noticeOpen'
				| '_noticeShown'
				| '_cleanEl'
				| '_importantEl'
				| '_token'
				| '_loading'
				| '_again'
				| '_timer'
				| '_hiddenChange'
				| '_stopTabs'
				| '_stopChanges'
				| '_stopView'
				| '_view'
				| '_items'
				| '_tabsOnly'
				| '_clickOnly'
				| '_stopClicks'
				| '_loadingKey'
				| '_loadingRetries'
				| '_statusEl'
				| '_toolbarEl'
				| '_summaryEl'
				| '_searchEl'
				| '_sortEl'
				| '_refreshEl'
				| '_smallEl'
				| '_smallTextEl'
				| '_listEl'
				| '_records'
				| '_recordCount'
				| '_recorded'
				| '_recordsReady'
				| '_recordsLoad'
				| '_recordsAgain'
				| '_recording'
				| '_recordingKeys'
				| '_recordTried'
				| '_dismissed'
				| '_recordProblem'
				| '_openRecords'
				| '_removingRecords'
				| '_recordsShown'
				| '_listRecorded'
				| '_recordNotes'
				| '_recordsEl'
				| '_recordsTitleEl'
				| '_recordsListEl'
				| '_openSerials'
				| '_serialRecords'
				| '_matches'
				| '_matchJson'
				| '_matching'
				| '_matchNotify'
				| '_matchAnnounced'
				| '_matchProblem'
			>;

		}

	}

}

export { };
