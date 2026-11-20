/**
 * @file modules/imageInfo/module.globals.d.ts
 * @description Global TypeScript declarations for modules/imageInfo/module.mjs — the module description without DOM: the
 * permissions by the browser, the settings (recording the headers, reading other origins while loading in Firefox), the limits
 * of the listing and the module's messages.
 * Module: Records the HTTP headers of images while pages load them; the listing of the images of the page is imageInfoSandbox.
 */

declare global {

	namespace Types {

		namespace ImageInfo {

			/** The module.mjs namespace — checked against Types.ModuleDescriptor (the full module description). */
			type Descriptor = Types.Satisfies<Types.ModuleDescriptor, typeof import( './module.mjs' )>;

			/**
			 * The settings of the module: record the headers, read other origins while loading (Firefox only), the limits of the
			 * metadata of one file and the most characters of JSON of the metadata stored with a record
			 */
			type Config = { headers: boolean; capture: boolean; metadata: MetadataLimits; maxStoredChars: number };

			/** A limit the settings change (a number field): its key, the default and the allowed range */
			type LimitSetting = { key: string; default: number; min: number; max: number };

			/** The listing of the page the background part sends back (or why not) */
			type PageResponse = { page: Page } | { error: string };

			/** The status for the element of the module */
			type StatusResponse = Status | { error: string };

		}

		interface Messages {

			/** Extension page → background part: the listing of the images of the page in the tab */
			IMAGE_INFO_PAGE: { request: { tabId: number }; response: Types.ImageInfo.PageResponse };

			/** Background part → extension pages: new records of the tab (the core passes it on as "records" of imageInfo.onChange) */
			IMAGE_INFO_UPDATED: { request: { tabId: number }; response: undefined };

			/** Element → background part: the status of the recording */
			IMAGE_INFO_STATUS: { request: {}; response: Types.ImageInfo.StatusResponse };

			/** Extension page → background part: download an image the listing of the tab showed once more */
			IMAGE_INFO_FETCH: { request: { tabId: number; url: string; anonymous?: boolean }; response: { ok: true } | { error: string } };

			/** Extension page → background part: the whole file of an image the listing of the tab showed, for saving */
			IMAGE_INFO_SAVE: {
				request: { tabId: number; url: string; anonymous?: boolean };
				response: { data: string; contentType: string | null; fileName: string; source: 'browser' | 'network' } | { error: string };
			};

			/** Extension page → background part: the whole file of an image for the thumbnail (download: once more from the network) */
			IMAGE_INFO_READ: {
				request: { tabId: number; url: string; anonymous?: boolean; download?: boolean };
				response: { data: string; contentType: string | null; source: 'browser' | 'network' } | { error: string };
			};

			/** Extension page → background part: remove an image the listing of the tab showed from the page (how many of its usages) */
			IMAGE_INFO_REMOVE: { request: { tabId: number; url: string }; response: { removed: number } | { error: string } };

			/** Extension page → background part: the frames of the last listing of the tab keep reporting their view (VIEW_LEASE_MS more) */
			IMAGE_INFO_WATCH: { request: { tabId: number }; response: { ok: true } | { error: string } };

			/** A frame of a tab → background part: which of its images are visible and which one is under the pointer (the keys) */
			IMAGE_INFO_VIEW_REPORT: { request: Types.ImageInfo.ViewReport; response: undefined };

			/** Background part → extension pages: the report of a frame with the tab and the frame (the core passes it on to imageInfo.onView) */
			IMAGE_INFO_VIEW: { request: Types.ImageInfo.ViewReport & { tabId: number; frameId: number }; response: undefined };

			/** Extension page (the floating window, which gets no messages in Firefox) → background part: the last reports of the frames of the tab */
			IMAGE_INFO_VIEW_STATE: { request: { tabId: number }; response: { frames: ( Types.ImageInfo.ViewReport & { frameId: number } )[] } | { error: string } };

			/**
			 * Extension page → background part: the marks of the properties of the images the listing of the tab showed, on the page
			 * (MARK_LEASE_MS more; an empty list takes them away) with the name of the module they are from; how many elements have a badge
			 */
			IMAGE_INFO_MARK: { request: { tabId: number; images: Types.ImageInfo.MarkedImage[]; source: string }; response: Types.ImageInfo.MarkResult | { error: string } };

		}

	}

	namespace Functions {

		namespace ImageInfo {

			namespace Module {

				/** Firefox? (by the scheme of the extension's own address) */
				type isFirefox = () => boolean;

				/** A limit from the stored value (empty or invalid = the default, otherwise clamped to the range) */
				type resolveLimit = ( value: unknown, limit: Types.ImageInfo.LimitSetting ) => number;

				/** The settings of the module */
				type loadConfig = ( api: Types.ModuleApi ) => Promise<Types.ImageInfo.Config>;

				/** The permissions the settings need */
				type neededPermissions = ( config: Pick<Types.ImageInfo.Config, 'headers' | 'capture'> ) => Required<Types.PermissionSet>;

				/** The part of the permissions not granted yet (null = all granted) */
				type missingPermissions = ( api: Types.ModuleApi, needed: Types.PermissionSet ) => Promise<Required<Types.PermissionSet> | null>;

				/** The name of a saved image file (by the address and the type) */
				type imageFileName = ( url: string, contentType: string | null ) => string;

			}

		}

	}

}

export { };
