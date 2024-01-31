/*!
Hype DataMagic 1.4.0
copyright (c) 2022 Max Ziebell, (https://maxziebell.de). MIT-license
*/

/*
* Version-History
* 1.0 Initial release under MIT-license
* 1.1 Minor performance updates
* 1.2 Multi handler support added
-- switched to semantic versioning
* 1.3.0 Multiple updates on IDE preview
* 1.3.1 Fixed IDE preview existing symbols, cleanups
* 1.3.2 Fixed event data bug and unloads, allow event returns
* 1.3.3 Added forceRedraw (bugfix), HypeDataMagic.refresh and auto refresh
* 1.3.4 Ending handler with () forwards them to hypeDocument.functions, exposed resolveObjectByKey 
*       and added and exposed resolveKeyToArray (keys can now be arrays), fixed append/prepend bug
* 1.3.5 Function in data constructs are now resolved, new handler 'variables' resolves to customData,
*       exposed default 'handler', to change use HypeDataMagic.setDefault('handler', 'text'),
*       new default 'customData' is used to init hypeDocument.customData (in addition to old 'customDataForPreview'),
*       new default 'allowDataFunctions' is set to true and allows for functions in data,
*       new default 'allowVariables' is set to true and allows for variables in default handlers image and text,
*       exposed low-level functions resolveVariablesInString, resolveVariablesInObject and cloneObject
* 1.3.6 Added dataset variables and the handler 'dataset',
*       Added data-magic-sets to enable comma separated queries for foreign datasets, parent(s) and closest()
*       Added default refreshOnCustomData and reactivity to custom data,
*       Exposed HypeDataMagic.enableReactiveObject (low-level) allowing to create you own reactive objects,
*       Exposed HypeDataMagic.disableReactiveObject (low-level) to revert a object back to normal,
*       Added HypeDataMagic.debounceByRequestFrame (helper) to create a function version that is debounced by rAF,
*       Added HypeDataMagic.createSequence (helper) as a function factory for sequences progress on demand,
*       Change default on all forceRedraws (Safari-Bugfix) to false, you can enable them if needed for IDE or exports only,
*       Added HypeDataMagic.setDefault('highlightDataMagic', true); to allow inspecting regions managed by Data Magic,
*       Added inline syntax for data-magic-key as source:key (this overrides any branch lookups),
*       Added inline syntax for variables as source:key, add %{} and (sparkles-emoji){} options for variable names,
*       Refactored observer in IDE portion, added plenty of comments to code
* 1.3.7 Reverted the observer in IDE portion (only affects preview in IDE, fixing quirks)
* 1.3.8 Removed reactivity in favor of Hype Reactive Content and added compatibility, 
*       Removed createSequence, find it at https://gist.github.com/worldoptimizer/ef38b989bbe76f219c77d2aba1cd9c68
*       Assigning customData is now done with assign instead of overwriting it
* 1.3.9 Refactored findMagicAttribute, exposed it as findAttribute,
*       Added the ability to traverse data-magic-braches further with +,
*       HypeDataMagic.setData now offers to set a key on a object
* 1.4.0 Fixed bug not using branches from inner elements data-magic-key definitions
*       Fixed a retrieval bug by adding baseElement to findAttribute limiting the search to an element
*       Fixed legacy code usage of substr in favor of slice
*       Added HypeDataMagic.resolveVariables allowing to resolve variables in objects and strings (auto detected wrapper)
*       Added HypeDataMagic.constructVariablesContext allowing to construct a variables context for resolving variables
*       Added new default autoVariables allowing to resolve variables automatically before handlers are called
*       Added legacy support for handling variables in text and image handlers
*       Switched display from Data Magic to key content as suggested by @MarkHunte
*/
if ("HypeDataMagic" in window === false) window['HypeDataMagic'] = (function() {

	/* @const */
	const _debug = false;
	/* @const */
	const _isHypeIDE = window.location.href.indexOf("/Hype/Scratch/HypeScratch.") != -1;

	var _extensionName = 'Hype Data Magic';
	var _data = {};
	var _observer = {};
	var _hypeDocumentIDE;

	/**
	 * defaults can be overriden with setDefault
	 * 
	 * @property {string} source - the default source of the data
	 * @property {function} fallbackImage - fallback image if no image is provided (defaults to empty PNG)
	 * @property {string} handler - default handler if not provided using data-magic-handler
	 * @property {object} variables - default variables (used instead of custom Data if set)
	 * @property {object} handlerMixin -  handler mixins
	 * @property {object} sourceRedirect - the source redirect lookup
	 * @property {boolean} refreshOnSetData -  trigger refresh on set data
	 * @property {boolean} refreshOnCustomData - trigger refresh on custom data
	 * @property {boolean} forceRedrawElement - force redraw elements
	 * @property {boolean} forceRedrawDocument - force redraw document
	 * @property {boolean} allowDataFunctions - allow data functions
	 * @property {boolean} allowVariables - allow variables
	 * @property {boolean} allowDatasets - allow datasets
	 * @property {string} resourcesFolderNameForPreview - the resources folder name for previews (is usually autodetected)
	 */
	var _default = {
		source: 'shared',
		fallbackImage: function() {
			return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
		},
		handler: 'text',
		variables: null,
		handlerMixin: {},
		sourceRedirect: {},
		refreshOnSetData: true,
		refreshOnCustomData: true,
		forceRedrawElement: false,
		forceRedrawElementNonIDE: false,
		forceRedrawDocument: false,
		forceRedrawDocumentNonIDE: false,
		highlightDataMagic: true,
		allowDataFunctions: true,
		allowVariables: true,
		allowDatasets: true,
		allowMagicSets: true,
		autoVariables: true,
		resourcesFolderNameForPreview: '',
	};

	/**
	 * Force redraw of an element
	 * @param {HTMLElement} element
	 */
	var forceRedraw = function(element) {
		var disp = element.style.display;
		element.style.display = 'none';
		void 0 != element.offsetHeight;
		element.style.display = disp;
	};

	/*
	 *	_handler is an object that contains all the handlers for the different types of data.
	 *	Each handler is an object that contains two functions:
	 *		DataMagicPrepareForDisplay: called when the data is loaded and the element is about to be displayed
	 *		DataMagicUnload: called when the data is unloaded and the element is about to be hidden
	 *	Each function receives three parameters:
	 *		hypeDocument: the hypeDocument object
	 *		element: the element that is being displayed
	 *		event: the event object that contains the data
	 */
	var _handler = {
		'text': {
			DataMagicPrepareForDisplay: function(hypeDocument, element, event) {
				if (element.innerHTML != event.data && hasNoHypeElementsAsChild(element)) {
					// legacy support before autoVariables
					if (!_default['autoVariables'] && _default['allowVariables']) {
						var variablesContext = constructVariablesContext(hypeDocument, element);
						event.data = resolveVariables(event.data, variablesContext);
					}
					element.innerHTML = event.data;
				}
			},
			DataMagicUnload: function(hypeDocument, element, event) {
				if (hasNoHypeElementsAsChild(element)) element.innerHTML = '';
			}
		},
		'variables': {
			DataMagicPrepareForDisplay: function(hypeDocument, element, event) {
				if (_default['allowVariables']) event.data = resolveVariablesInString(event.data, _default['variables'] || hypeDocument.customData);
				return event;
			}
		},
		'dataset': {
			DataMagicPrepareForDisplay: function(hypeDocument, element, event) {
				if (element && _default['allowDatasets']) event.data = resolveVariablesInObject(event.data, { dataset: resolveDatasetVariables(element) });
				return event;
			}
		},
		'image': {
			DataMagicPrepareForDisplay: function(hypeDocument, element, event) {
				if (typeof event.data == 'string') event.data = { src: event.data };
				if (!event.data.src) event.data.src = element.dataset.fallbackImage || _default.fallbackImage();
				// legacy support before autoVariables
				if (!_default['autoVariables'] && _default['allowVariables']) {
					var variablesContext = constructVariablesContext(hypeDocument, element);
					event.data = resolveVariables(event.data, variablesContext);
				}
				element.innerHTML = '';
				if (hypeDocument.getElementProperty(element, 'background-image') != event.data.src) {
					element.style.backgroundRepeat = 'no-repeat';
					element.style.backgroundPosition = event.data.backgroundPosition || element.dataset.backgroundPosition || 'center center';
					element.style.backgroundSize = event.data.backgroundSize || element.dataset.backgroundSize || 'contain';
					hypeDocument.setElementProperty(element, 'background-image', event.data.src);
				}
			},
			DataMagicUnload: function(hypeDocument, element, event) {
				hypeDocument.setElementProperty(element, 'background-image', '');
				element.style.backgroundRepeat = element.style.backgroundPosition = element.style.backgroundRepeat = '';
			}
		}
	}

	/**
	 * Resolves variables in a string or an object by delegating to the specific resolve functions.
	 * 
	 * @param {string|object} input - The input string or object with variables to resolve.
	 * @param {object} variables - The variables to use for resolving.
	 * @returns {string|object} - The input with resolved variables.
	 */
	function resolveVariables(input, variables) {
		if (typeof input === 'string') {
			return resolveVariablesInString(input, variables);
		} else if (typeof input === 'object') {
			return resolveVariablesInObject(input, variables);
		}
		return input; // Return the input as is if it's neither a string nor an object.
	}

	/**
	 * Constructs the variables context for resolving variables in strings or objects.
	 * 
	 * @param {HYPE.documents.HYPEDocument} hypeDocument - The Hype document object.
	 * @param {HTMLElement} element - The HTML element associated with the current handler.
	 * @returns {object} - The constructed variables context.
	 */
	function constructVariablesContext(hypeDocument, element) {
		return Object.assign({},
			_default['variables'] || hypeDocument.customData, // Custom data or default variables
			{ resourcesFolderName: hypeDocument.resourcesFolderURL() }, // Resources folder URL
			element && _default['allowDatasets'] ? { dataset: resolveDatasetVariables(element) } : null // Dataset variables if allowed
		);
	}

	/**
	 * Calls the handler function for the given event. This function is called by the event handler. It calls the handler function for the given event.
	 *
	 * @param {HYPE.documents.HYPEDocument} hypeDocument The document object.
	 * @param {HTMLElement} element The element that triggered the event.
	 * @param {Object} event The event object.
	 */
	function callHandler(hypeDocument, element, event) {
		if (!event.handler) return;

		if (event.handler.slice(-2) == '()') {
			if (!_isHypeIDE && hypeDocument.functions) {
				try {
					returnFromHandler = hypeDocument.functions()[event.handler.slice(0, -2)](hypeDocument, element, event);
				} catch (e) {
					console.log('There was an error in your handler "' + event.handler + '": ', e);
				}
				return returnFromHandler;
			} else {
				return;
			}
		}

		var returnFromHandler;
		if (typeof _handler[event.handler] == 'object') {
			/* handle event if defined directly */
			if (typeof _handler[event.handler][event.type] == 'function') {
				try {
					returnFromHandler = _handler[event.handler][event.type](hypeDocument, element, event);
				} catch (e) {
					console.log('There was an error in your handler "' + event.handler + '": ', e);
				}
				return returnFromHandler;
			}
			/* fallback on DataMagicPrepareForDisplay for IDE if DataMagicPreviewUpdate is not defined */
			if (_isHypeIDE && typeof _handler[event.handler]['DataMagicPrepareForDisplay'] == 'function') {
				try {
					returnFromHandler = _handler[event.handler]['DataMagicPrepareForDisplay'](hypeDocument, element, event);
				} catch (e) {
					console.log('There was an error in your handler "' + event.handler + '": ', e);
				}
				return returnFromHandler;
			}
		}
	}

	/**
	 * This function is used to update the magic key of an element.
	 *
	 * @param {object} hypeDocument - The hypeDocument object.
	 * @param {object} element - The element object.
	 * @param {object} event - The event object.
	 */
	function updateMagicKey(hypeDocument, element, event) {
		if (!element.getAttribute('data-magic-key')) return;

		// find the source we are working from and handle special source customData
		var keyParts = trim(element.getAttribute('data-magic-key')).split(':');
		var key = keyParts[1] ? keyParts[1] : keyParts[0];
		var inlineSourceName = keyParts[1] ? keyParts[0].trim() : null;
		var source = inlineSourceName || findAttribute(element, 'data-magic-source') || _default['source'];

		var data = (source == 'customData') ? hypeDocument.customData : getData(source);

		// is we have a source proceed
		if (data) {
			// look if we have a brach an combine it with our key, only look if no inline source was used
			var branchkey = keyParts[1] ? '' : findAttribute(element, 'data-magic-branch', true, element.closest('[data-magic-source]'));
			console.log(element.closest('[data-magic-source]'))
			var branch = branchkey ? resolveObjectByKey(data, branchkey) : data;
			var branchdata = resolveObjectByKey(branch, key);

			if (branchdata != null) {
				// check if we have a object as data source
				if (typeof(branchdata) != 'object' && typeof(branchdata) != 'function') {
					var prefix = element.getAttribute('data-magic-prefix') || '';
					var append = element.getAttribute('data-magic-append') || '';
					if (prefix || append) {
						branchdata = prefix + branchdata + append;
					}
				}

				// new autoVariables feature
				if (_default['autoVariables'] && _default['allowVariables']) {
					var variablesContext = constructVariablesContext(hypeDocument, element);
					branchdata = resolveVariables(branchdata, variablesContext);
				}

				// construct our event object by creating a new one
				event = Object.assign({}, event, {
					'data': branchdata,
					'source': source,
					'key': key,
				});

				// define types of events to be fired
				var types;
				if (event.type) {
					// reuse Hype events as our own by renaming
					types = event.type.replace('HypeScene', 'DataMagic').split();
				} else {
					// create event if not given (direct refresh etc.)
					types = _isHypeIDE ? ['DataMagicPreviewUpdate'] : ['DataMagicPrepareForDisplay', 'DataMagicLoad'];
				}

				// extract handler string as array and loop over it
				var handlers = (element.getAttribute('data-magic-handler') || _default['handler']).split(',');

				// loop over types array
				types.forEach(function(type) {
					// loop over handler array
					// allow returns from handlers to be mixed in to the next item in the call stack
					var returnFromHandler;
					handlers.forEach(function(handler) {
						returnFromHandler = callHandler(hypeDocument, element, Object.assign({}, event, returnFromHandler, {
							type: type,
							handler: handler.trim()
						}));
					})
				})

			} else {
				unloadMagicKey(hypeDocument, element);
			}
		}
	}


	/**
	 * This is a description of the unloadMagicKey function.
	 *
	 * @param {HypeDocument} hypeDocument - The HypeDocument object.
	 * @param {HTMLElement} element - The element that triggered the event.
	 * @param {Event} event - The event object.
	 * @returns {void}
	 */
	function unloadMagicKey(hypeDocument, element, event) {
		// make sure we have an object
		event = Object.assign({}, event);

		// extract handler string as array
		handlers = (event.oldHandler || element.getAttribute('data-magic-handler') || _default['handler']).split(',');

		// loop over handler array
		// allow returns from handlers to be mixed in to the next item in the call stack
		var returnFromHandler;
		handlers.forEach(function(handler) {
			returnFromHandler = callHandler(hypeDocument, element, Object.assign({}, event, returnFromHandler, {
				type: 'DataMagicUnload',
				handler: handler.trim()
			}));
		})
	}

	/**
	 * This function checks if the element has no Hype elements as child.
	 *
	 * @param {HTMLElement} element - The element to check.
	 * @returns {boolean} - True if the element has no Hype elements as child, false otherwise.
	 */
	function hasNoHypeElementsAsChild(element) {
		return !element.querySelectorAll('.HYPE_element, .HYPE_element_container').length;
	}

	/**
	 * The change observer is a MutationObserver that observes the DOM for changes
	 * to the data-magic-* attributes. When a change is detected, the change observer will call the appropriate
	 * functions to update the magic key. This function creates a change observer for the specified Hype document.
	 *
	 * @param {HYPE_Document} hypeDocument - The Hype document.
	 * @param {HTMLElement} baseContainer - The base container.
	 */
	function createChangeObserver(hypeDocument, baseContainer) {
		if (_observer[hypeDocument.documentId()]) return;

		_observer[hypeDocument.documentId()] = {

			changeObserver: new MutationObserver(function(mutations) {
				mutations.forEach(function(mutation) {
					if (mutation.type != 'attributes') return;

					var element = mutation.target;
					var attributeName = mutation.attributeName;
					var currentValue = trim(element.getAttribute(attributeName));
					var oldValue = mutation.oldValue;

					if (currentValue == oldValue) return;

					switch (attributeName) {
						case 'data-magic-key':
							if (currentValue) {
								updateMagicKey(hypeDocument, element);
							} else {
								unloadMagicKey(hypeDocument, element)
							}
							break;

						case 'data-magic-source':
						case 'data-magic-branch':
							unloadMagicKey(hypeDocument, element);
							refresh(hypeDocument, element);
							break;

						case 'data-magic-handler':
							unloadMagicKey(hypeDocument, element, { oldHandler: oldValue });
							refresh(hypeDocument, element);
							break;

						case 'data-magic-prefix':
						case 'data-magic-append':
							refresh(hypeDocument, element);
							break;

					}
				});
			}),

			options: {
				subtree: true,
				attributes: true,
				attributeFilter: [
					'data-magic-key',
					'data-magic-source',
					'data-magic-branch',
					'data-magic-handler',
					'data-magic-prefix',
					'data-magic-append'
				],
				attributeOldValue: true
			},

			enable: function() {
				this.changeObserver.observe(baseContainer, this.options);
			},

			disable: function() {
				this.changeObserver.disconnect();
			}
		}
	}

	/**
	 * Enable the change observer for the specified Hype document.
	 *
	 * @param {HYPE_Document} hypeDocument - The Hype document.
	 */
	function enableChangeObserver(hypeDocument) {
		if (!_observer[hypeDocument.documentId()]) return;
		_observer[hypeDocument.documentId()].enable();
	}

	/**
	 * Disable the change observer for the specified Hype document.
	 *
	 * @param {HYPE_Document} hypeDocument - The Hype document.
	 */
	function disableChangeObserver(hypeDocument) {
		if (!_observer[hypeDocument.documentId()]) return;
		_observer[hypeDocument.documentId()].disable();
	}

	/**
	 * Refresh the descendants of the specified element.
	 *
	 * @param {HYPE_Document} hypeDocument - The Hype document.
	 * @param {HTMLElement} element - The element.
	 * @param {Event} event - The event.
	 */
	function refreshDescendants(hypeDocument, element, event) {
		if (!element) return;
		var elms = element.querySelectorAll('[data-magic-key]');
		elms.forEach(function(elm) {
			updateMagicKey(hypeDocument, elm, event);
			if (_default['forceRedrawElement'] || (!_isHypeIDE && _default['forceRedrawElementNonIDE'])) forceRedraw(elm);
		});
	}

	/**
	 * Refresh the specified element.
	 *
	 * @param {HYPE_Document} hypeDocument - The Hype document.
	 * @param {HTMLElement} element - The element.
	 * @param {Event} event - The event.
	 */
	function refreshElement(hypeDocument, element, event) {
		if (!element) return;
		updateMagicKey(hypeDocument, element, event);
		if (_default['forceRedrawElement'] == true || (!_isHypeIDE && _default['forceRedrawElementNonIDE'])) forceRedraw(element);
	}

	/**
	 * Refresh the specified element and its descendants.
	 *
	 * @param {HYPE_Document} hypeDocument - The Hype document.
	 * @param {HTMLElement} element - The element.
	 * @param {Event} event - The event.
	 */
	function refresh(hypeDocument, element, event) {
		if (!element) return;
		refreshElement(hypeDocument, element, event);
		refreshDescendants(hypeDocument, element, event);
		if (_default['forceRedrawDocument'] == true || (!_isHypeIDE && _default['forceRedrawDocumentNonIDE'])) forceRedraw(element);
	}

	/**
	 * Debounced version of above (internal usage)
	 */
	var refreshDebounced = debounceByRequestFrame(refresh);


	/**
	 * This function allows to set data
	 *
	 * @param {Object} data This parameter needs to be an object but it can hold nested values of any type. To use JSON data parse the data before you set it. If you want to store a single value, use the key parameter.
	 * @param {String} source The source is a optional name to store the data. It defaults to the string "shared". If you want to store a single value, use the key parameter.
	 * @param {String} key The key is a optional name to store the data. It defaults to the string "shared". If you want to store a single value, use the key parameter.
	 */
	function setData(data, source, key) {
		source = source || _default['source'];
		if (key) {
			if (!_data[source]) _data[source] = {};
			var objPath = resolveKeyToArray(key);
			var objKey = objPath.pop();
			var branch = resolveObjectByKey(_data[source], objPath);
			if (branch) branch[objKey] = data;
		} else {
			_data[source] = data;
		}
		if (_default['refreshOnSetData'] == true) {
			refreshFromWindowLevelDebounced();
		}
	}
	
	/**
	  * This function allows to get data
	  *
	  * @param {String} source This the name of the data you want to access. It defaults to the string "shared".
	  * @param {String} key This (optional) key resolves the data given a key
	  * @return Returns the object Hype Data Magic currently has stored under the given source name.
	  */
	 function getData(source, key){
		 if (_default['sourceRedirect'][source]) return _data[_default['sourceRedirect'][source]] || null;
		 if (!source) source = _default['source'];
		 var data = _data[source] || null;
		 if (data && key) return resolveObjectByKey(data, key);
		 return data;
	 }

	/**
	 * This function allows to refesh the view from the window level using HypeDataMagic.refresh
	 *
	 * @param {Object} hypeDocument This parameter is optional and should be a hypeDocument object to refresh. If no paramter is provided it will refresh all documents found under window.HYPE.documents
	 */
	function refreshFromWindowLevel(hypeDocument) {
		//refresh explicit document
		if (hypeDocument && hypeDocument.hasOwnProperty('refresh')) {
			hypeDocument.refresh();

		//refresh all documents
		} else if (window.hasOwnProperty('HYPE')) {
			Object.values(window.HYPE.documents).forEach(function(hypeDocument) {
				// refresh function check since 1.4.0
				if (hypeDocument.hasOwnProperty('refresh')) hypeDocument.refresh();
			});
		}
	}
	
	/**
	 * Debounced version of above (internal usage)
	 */
	var refreshFromWindowLevelDebounced = debounceByRequestFrame(refreshFromWindowLevel)

	/**
	 * This function allows to override a default
	 *   
	 * * source: String that defines the default source name. Defaults to 'shared'.
	 * * `fallbackImage`: Function that return a fallback image url or base64 version. Defaults to transparent image.
	 * * `handlerMixin`: Object that contains mixins added when calling addHandler. Defaults to {}.
	 * * `sourceRedirect`: Object that contains map key:value of source redirects. Defaults to {}.
	 * * `customDataForPreview`: Object that contains preview value for custom data (only displayed in IDE). Defaults to {}.
	 *
	 * @param {String} key This is the key to override
	 * @param {String|Function|Object} value This is the value to set for the key
	 */
	function setDefault(key, value) {
		_default[key] = value;
	}

	/**
	 * This function returns the value of set default
	 *
	 * @param {String} key This the key of the default.
	 * @return Returns the current value for a default with a certain key.
	 */
	function getDefault(key) {
		return _default[key];
	}


	/**
	 * This function removes all the white spaces from the beginning and the end of the string
	 *
	 * @param {string} str - The string to be trimmed
	 * @returns {string} - The trimmed string
	 */
	function trim(str) {
		if (typeof str != 'string') return;
		return str.trim();
	}

	/**
	 * This low level function returns a array resolved based on a string key notation similar to actual code
	 *
	 * @param {String} obj This the object the key should act on.
	 * @param {String} key This the key to resolve the object by in string form.
	 * @return Returns the current value for a default with a certain key.
	 */
	function resolveKeyToArray(key) {
		if (Array.isArray(key)) return key.reduce(function(a, b) {
			return a.concat(resolveKeyToArray(b));
		}, []);
		if (typeof key != 'string') return;
		key = key.replace(/\[(\d+)\]/g, function(match, key) {
			return '.' + parseInt(key);
		});
		key = key.replace(/^\./, '');
		return key.split('.');
	}

	/**
	 * This low level function returns resolves an object based on a string key notation similar to actual code and returns the value or branch if successful
	 *
	 * @param {String} obj This is the object the key should act on.
	 * @param {String} key This is key based on notation similar to actual code to resolve the object with. The key can also be provided as a pre-processed array of strings.
	 * @return Returns the current value for a default with a certain key.
	 */
	function resolveObjectByKey(obj, key) {
		if (typeof obj != 'object') return;
		var keyParts = resolveKeyToArray(key);
		var objValue = obj;
		var i = 0;
		while (objValue !== undefined && i < keyParts.length) {
			objValue = objValue[keyParts[i]];
			if (_default['allowDataFunctions'] && typeof objValue === 'function') {
				objValue = objValue();
			}
			i++;
		}
		return objValue;
	}

	/**
	 * Resolve variables in object using resolveVariablesInString recursively and a variables lookup
	 *
	 * @param {Object} obj - The object to resolve variables in
	 * @param {Object} variables - The variables to use for resolving
	 * @param {Boolean} noClone - If true, the object will not be cloned before resolving
	 * @returns {Object} The resolved object
	 */
	function resolveVariablesInObject(obj, variables, noClone) {
		if (typeof obj === 'object') {
			if (!noClone) obj = cloneObject(obj);
			Object.keys(obj).forEach(function(key) {
				obj[key] = resolveVariablesInObject(obj[key], variables, true);
			});
		} else if (typeof obj === 'function') {
			obj[key] = resolveVariablesInObject(obj[key](), variables, true);
		} else if (typeof obj === 'string') {
			obj = resolveVariablesInString(obj, variables);
		}
		return obj;
	}

	/**
	 * Resolve variables in string using a variable lookup
	 *
	 * @param {string} str The string to resolve variables in.
	 * @param {object} variables The variables to resolve.
	 * @returns {string} The resolved string.
	 */
	function resolveVariablesInString(str, variables) {
		if (typeof str === 'string') {
			var matches = str.match(/\${.*?}|%{.*?}|✨{.*?}/g);
			if (matches) {
				matches.forEach(function(match) {
					var keyParts = match.replace(/\$\{|\%\{|\✨\{|\}|\(\)/g, '').split(':');
					var variableKey = keyParts[1] ? keyParts[1] : keyParts[0];
					var sourceData = keyParts[1] ? getData(keyParts[0].trim()) : null;
					var variableValue = resolveObjectByKey(sourceData || variables, variableKey);
					str = str.replace(match, variableValue);
				});
			}
		}
		return str;
	}

	/**
	 * @description This function clones an object
	 *
	 * @param {object} obj
	 * @returns {object} copy
	 */
	function cloneObject(obj) {
		if (null == obj || "object" != typeof obj) return obj;
		var copy = obj.constructor();
		for (var attr in obj) {
			if (obj.hasOwnProperty(attr)) copy[attr] = cloneObject(obj[attr]);
		}
		return copy;
	}
	
	/**
	 * This function finds the value of an attribute on an element or its parents.
	 * If the attribute value starts with a '+' then it is added to the value of the attribute on the parent.
	 *
	 * @param {HTMLElement} element - The element to start searching from.
	 * @param {string} attr - The name of the attribute to search for.
	 * @param {boolean} allowAdditions - If true, the value of the attribute will be added to the value of the attribute in the parent.
	 * @param {HTMLElement} baseElement - The element to stop searching at.
	 * @returns {string} The value of the attribute.
	 */
	function findAttribute(element, attr, allowAdditions, baseElement) {
		if (!element) return null;
		var foundValue = '';
		while (element !== null) {
			var currentValue = element.getAttribute(attr);
			// fixed falsy values checks allowing empty strings with 1.4.0
			if (currentValue !== null) {
				if (allowAdditions && currentValue.indexOf('+') == 0) {
					foundValue = currentValue.slice(1) + (foundValue ? '.' + foundValue : '');
				} else {
					return  currentValue + (foundValue? '.'+ foundValue : '');
				}
			}
			element = element.parentNode.closest('['+attr+']');
			// fixed to not surpase a base element if given with 1.4.0
			if (element && baseElement && !baseElement.contains(element)) element = null;
		};
	}

	/**
	 * This function allows to add custom data handler.
	 * These following keys can be defined if supplied as an array
	 *
	 * * `DataMagicPreviewUpdate`: Gets fired only in the IDE
	 * * `DataMagicPrepareForDisplay`: Gets fired along HypeScenePrepareForDisplay
	 * * `DataMagicLoad`: Gets fired along HypeSceneLoad
	 * * `DataMagicUnload`: Gets fired along HypeSceneUnload
	 *
	 * If the handler is only set as an functions it defaults to setting
	 *		DataMagicPrepareForDisplay
	 *
	 * @param {String} name The name your handler is identified by in data-magic-handler
	 * @param {Function|Object} handler This is either an object with functions or a single function
	 */
	function addDataHandler(name, handler) {
		if (!typeof name == 'string') return;
		switch (typeof handler) {
			case 'object':
				_handler[name] = Object.assign({}, _default['handlerMixin'], handler);
				break;

			case 'function':
				_handler[name] = Object.assign({}, _default['handlerMixin'], _handler['text']);
				_handler[name]['DataMagicPrepareForDisplay'] = handler;
				break;
		}
	}

	/**
	 * Resolves the magicSets attribute of an element.
	 *
	 * @param {HTMLElement} element The element to resolve the magicSets attribute for.
	 * @returns {Object} The resolved dataset.
	 */
	function resolveDatasetVariables(element) {
		var dataset = Object.assign({}, element.dataset);
		if (_default['allowMagicSets'] && dataset.magicSets) {
			var entries = dataset.magicSets.split(",");
			let i = 0;
			while (i < entries.length) {
				var entry = entries[i].trim();
				switch (entry) {
					case "parent":
						var parent = element.parentElement.parentElement;
						if (parent) {
							assignNew(dataset, parent.dataset);
						}
						break;

					case "parents":
						var parent = element.parentElement;
						while (parent && !parent.classList.contains("HYPE_scene")) {
							assignNew(dataset, parent.dataset);
							parent = parent.parentElement;
						}
						break;

					default:
						if (entry.indexOf("closest(") === 0 && entry.indexOf(")") === entry.length - 1) {
							var content = entry.substring(8, entry.length - 1);
							var closest = element.closest(content);
							if (closest) {
								assignNew(dataset, closest.dataset);
							}
						} else {
							var elements = document.querySelectorAll(entry);
							elements.forEach(element => {
								assignNew(dataset, element.dataset);
							});
						}
				}
				i++;
			}
		}
		return dataset;
	}

	/**
	 * This function only assigns values from source if they are not present in target
	 *
	 * @param {Object} target - The target object
	 * @param {Object} source - The source object
	 */
	function assignNew(target, source) {
		for (var key in source) {
			if (!target.hasOwnProperty(key)) {
				target[key] = source[key];
			}
		}
	}

	/**
	 * Create a debounced function that delays invoking `fn` until after `delay` milliseconds have elapsed since the last time the debounced function was invoked.
	 *
	 * @param {function} fn - the function to be debounced
	 * @param {number} delay - the delay in milliseconds
	 * @returns {function} - a debounced function
	 */
	function debounceByRequestFrame(fn) {
		return function() {
			if (fn.timeout) return;
			var args = arguments;
			fn.timeout = requestAnimationFrame(function() {
				fn.apply(this, args);
				fn.timeout = null;
			}.bind(this));
		};
	}


	/**
	 * HypeDocumentLoad is called when the document is loaded.
	 *
	 * @param {HYPE_Document} hypeDocument
	 * @param {Element} element
	 * @param {Event} event
	 */
	function HypeDocumentLoad(hypeDocument, element, event) {

		/**
		 * This function allows to refresh the data in the current scene.
		 *
		 * This function is useful when you want to refresh the data of the current scene.
		 * It will refresh the data of the scene element and all its descendants.
		 *
		 * If you want to refresh the data of a specific element, use the function hypeDocument.refreshElement.
		 * If you want to refresh the data of all descendant of a given element, use the function hypeDocument.refreshDescendants.
		 *
		 * @param {HTMLDivElement} element The element (including descendants) to refresh. This defaults to the scene element.
		 */
		hypeDocument.refresh = function(element) {
			refresh(this, element || document.getElementById(this.currentSceneId()));
		}

		/**
		 * This function allows to refresh the data in the current scene.
		 * This function is debounced by requestAnimationFrame.
		 *
		 * @param {HTMLDivElement} element The element (including descendants) to refresh. This defaults to the scene element.
		 */
		hypeDocument.refreshDebounced = debounceByRequestFrame(hypeDocument.refresh);


		/**
		 * This function allows to refresh the data of all descendant of a given element
		 *
		 * @param {HTMLDivElement} element The element to start the descendants refresh. This defaults to the scene element.
		 */
		hypeDocument.refreshDescendants = function(element) {
			refreshDescendants(this, element || document.getElementById(this.currentSceneId()));
		}

		/**
		 * This function allows to refresh the data of all descendant of a given element.
		 * This function is debounced by requestAnimationFrame.
		 *
		 * @param {HTMLDivElement} element The element to start the descendants refresh. This defaults to the scene element.
		 */
		hypeDocument.refreshDescendantsDebounced = debounceByRequestFrame(hypeDocument.refreshDescendants);


		/**
		 * This function allows to refresh a specific element
		 *
		 * @param {HTMLDivElement} element The element to refresh.
		 */
		hypeDocument.refreshElement = function(element) {
			refreshElement(this, element);
		}

		/**
		 * This function allows to refresh a specific element.
		 * This function is debounced by requestAnimationFrame.
		 *
		 * @param {HTMLDivElement} element The element to refresh.
		 */
		hypeDocument.refreshElementDebounced = debounceByRequestFrame(hypeDocument.refreshElement);


		/**
		 * This function allows to disable observer based refresh calls when updating a data-magic-* attribute
		 *
		 */
		hypeDocument.disableChangeObserver = function() {
			disableChangeObserver(this);
		}

		/**
		 * This function allows to (re)enable observer based refresh calls when updating a data-magic-* attribute
		 *
		 */
		hypeDocument.enableChangeObserver = function() {
			enableChangeObserver(this);
		}

		/**
		 * This function is a simple helper function that checks if the content provided differs from the content found in element.innHTML and only refreshes if needed.
		 *
		 * @param {HTMLDivElement} element The element to check
		 * @param {string} content The content to set in innerHTML if it differs
		 */
		hypeDocument.setContentIfNecessary = function(element, content) {
			if (element.innerHTML != content) {
				element.innerHTML = content;
			}
		}

		/* 
		new since 1.3.5: if _default('customData') is set it is used 
		to init hypeDocument.customData
		*/
		if (_default['customData']) {
			hypeDocument.customData = Object.assign(
				hypeDocument.customData,
				_default['customData']
			)
		}

		/*
		Create a change observer for the hypeDocument and element, and enables the change observer.
		*/
		if (!_isHypeIDE) {
			createChangeObserver(hypeDocument, element);
			enableChangeObserver(hypeDocument);
		}
	}

	/**
	 * HypeScenePrepareForDisplay is called when the scene is about to be displayed.
	 *
	 * @param {HYPE_Document} hypeDocument
	 * @param {Element} element
	 * @param {Event} event
	 */
	function HypeScenePrepareForDisplay(hypeDocument, element, event) {
		disableChangeObserver(hypeDocument);
		refresh(hypeDocument, element, event);
	}

	/**
	 * HypeSceneLoad is called when the scene is loaded.
	 *
	 * @param {HYPE_Document} hypeDocument
	 * @param {Element} element
	 * @param {Event} event
	 */
	function HypeSceneLoad(hypeDocument, element, event) {
		refresh(hypeDocument, element, event);
		enableChangeObserver(hypeDocument);
	}

	/**
	 * HypeSceneUnload is called when the scene is unloaded.
	 *
	 * @param {HYPE_Document} hypeDocument
	 * @param {Element} element
	 * @param {Event} event
	 */
	function HypeSceneUnload(hypeDocument, element, event) {
		disableChangeObserver(hypeDocument);
	}

	/* setup callbacks */
	if ("HYPE_eventListeners" in window === false) { window.HYPE_eventListeners = Array(); }
	window.HYPE_eventListeners.push({ "type": "HypeDocumentLoad", "callback": HypeDocumentLoad });
	window.HYPE_eventListeners.push({ "type": "HypeScenePrepareForDisplay", "callback": HypeScenePrepareForDisplay });
	window.HYPE_eventListeners.push({ "type": "HypeSceneLoad", "callback": HypeSceneLoad });
	window.HYPE_eventListeners.push({ "type": "HypeSceneUnload", "callback": HypeSceneUnload });

	/* run in IDE */
	if (_isHypeIDE) {

		/*
		The following code sets up the HypeDocumentIDE variable to be used in the scene editor.
		This will allow the scene editor to use some of the functions (from the original hypeDocument)
		that are not available in the scene editor.
		
		One such function is the "resourcesFolderURL()" function. This is useful for accessing resources (images, videos, etc.) that
		are contained in a folder in the scene editor. It can also be used for accessing custom functions that are not available in the scene editor.
		*/
		_hypeDocumentIDE = new Proxy({
			getElementProperty: function(element, property) {
				return element.style.getPropertyValue(property) || null;
			},
			setElementProperty: function(element, property, value) {
				if (value !== null) switch (property) {
					case 'background-image':
						value = 'url(' + value + ')';
						break;
				}
				element.style.setProperty(property, value, 'important');
			},
			documentId: function() {
				return 'HypeSceneEditor';
			},
			resourcesFolderURL: function() {
				return _default['resourcesFolderNameForPreview'] || window.location.href.replace(/\/$/, '')
			},
		}, {
			get: function(obj, prop) {
				if (prop === 'customData') return _default['customDataForPreview'] || _default['customData'] || {};
				return obj[prop];
			},
		});

		/* fire fake document load event for IDE */
		if (_debug) console.log(_extensionName + ': HypeDocumentLoad (extending _hypeDocumentIDE)');
		HypeDocumentLoad(_hypeDocumentIDE, document.documentElement);

		/*
		Observe for user interactions with Magic Data elements.
		
		1) Observes for changes to the contenteditable attribute
		2) When this happens, we refresh the preview
				// If the parent node has a magic key, we refresh the preview, or
				// If the parent node contains a magic key, we refresh the preview
		3) If the contenteditable attribute is set to true (ie we're inside the element), we
				// Set the magic-edit attribute to preview
				// Set a timeout so that the innerHTML of the element contains a placeholder comment
		4) If the contenteditable attribute is set to false (ie we're out of the element), we
				// Remove the magic-edit attribute from the parent node
				// Refresh the preview again
		
		We can't just refresh the preview when the contenteditable attribute is set to true, because the
		innerHTML is not yet set to the magic key. So we set a delay using setTimeout to wait for the innerHTML
		to be updated before we refresh the preview. We also need to remove the magic-edit attribute so that
		we don't end up in an infinite loop.
		*/
		var refreshObserver = new MutationObserver(function(mutations) {
			mutations.forEach(function(mutation) {
				var element = mutation.target;
				if (mutation.type === 'attributes') {

					if (element.parentNode && mutation.attributeName == 'contenteditable') {

						/* handle edits on rectangles with user set data-magic-key in the identity HTML attributes*/
						if (element.parentNode.hasAttribute('data-magic-key')) {
							if (element.getAttribute('contenteditable') == 'false' && mutation.oldValue == 'true') {
								if (_debug) console.log(_extensionName + ': innerHTML rebuild (after edit)');
								/* refresh the preview after edit */
								setTimeout(function() {
									element.parentNode.removeAttribute('magic-edit');
									refreshElement(_hypeDocumentIDE, element.parentNode);
								}, 1);

							} else {
								if (_debug) console.log(_extensionName + ': innerHTML purge (before edit)');
								/* add preview to innerHTML when double clicked */
								element.parentNode.setAttribute('magic-edit', 'preview');
								setTimeout(function() {
									var branch = findAttribute(element.parentNode, 'data-magic-branch', true);
									var placeholder = '<!-- Hype Data magic: This is only a preview placeholder and edits are ignored!';
									if (branch) placeholder += ' This key resides on the branch "' + branch + '"';
									placeholder += ' -->';
									element.innerHTML = placeholder + "\n" + element.parentNode.getAttribute('data-magic-key');
								}, 1);
							}
							return;
						}

						/* handle edits on rectangles that contain data-magic-keys but are not handled by previous block */
						if (element.parentNode.querySelectorAll('[data-magic-key]').length) {
							if (element.getAttribute('contenteditable') == 'false' && mutation.oldValue == 'true') {
								if (_debug) console.log(_extensionName + ': innerHTML rebuild included magic keys (after edit)');
								/* refresh the preview after edit */
								setTimeout(function() {
									element.parentNode.removeAttribute('magic-edit');
									var elms = element.parentNode.querySelectorAll('[data-magic-key]');
									elms.forEach(function(elm) {
										refreshElement(_hypeDocumentIDE, elm);
									});
								}, 1);

							} else {
								if (_debug) console.log(_extensionName + ': innerHTML purge included magic keys (before edit)');
								element.parentNode.setAttribute('magic-edit', 'innerHTML');
								/* substitute keys with the key identifier while editing */
								setTimeout(function() {
									var elms = element.parentNode.querySelectorAll('[data-magic-key]');
									elms.forEach(function(elm) {
										elm.innerHTML = elm.getAttribute('data-magic-key');
									});
								}, 1);
							}
							return;
						}
					}

				} else {
					
					if (_debug) console.log(_extensionName + ': unmapped mutation', mutation);
				}
			});
		});

		refreshObserver.observe(document.documentElement, {
			attributes: true,
			attributeOldValue: true,
			attributeFilter: ['contenteditable'],
			subtree: true,
		});

		/* handle updates in page like duplication and copy & paste */
		var _debounceInterval;
		var childListObserver = new MutationObserver(function(mutations) {
			if (_debounceInterval) return;
			if (mutations.length != 2) return;
			if (mutations[0].target.id != 'HypeMainContentDiv') return;
			_debounceInterval = setTimeout(function() {
				if (_debug) console.log(_extensionName + ': child list change (copy & paste or duplication)');
				_debounceInterval = null;
				refresh(_hypeDocumentIDE, document.documentElement);
			}, 1);
		})

		childListObserver.observe(document.documentElement, {
			childList: true,
			subtree: true,
		});

		/* handle updates on page while in same scene */
		_updates = {};
		var updateObserver = new MutationObserver(function(mutations) {
			mutations.forEach(function(mutation) {
				var currentValue = mutation.target.getAttribute(mutation.attributeName);
				if (currentValue && mutation.oldValue == currentValue && currentValue.indexOf('data-magic') != -1) {
					var id = mutation.target.getAttribute('hypeobjectid');
					if (_updates[id]) return;
					_updates[id] = setTimeout(function() {
						if (_debug) console.log(_extensionName + ': rebuild after Hype refresh', mutation.target.id);
						refreshElement(_hypeDocumentIDE, mutation.target);
						delete(_updates[id]);
					}, 1);
				}
			});
		})

		updateObserver.observe(document.documentElement, {
			attributes: true,
			attributeOldValue: true,
			attributeFilter: ['hypeattributelastkeysplist'],
			subtree: true,
		});

		/* setup after dom has loaded first time */
		window.addEventListener("DOMContentLoaded", function(event) {
			if (_debug) console.log(_extensionName + ': DOMContentLoaded');

			/* strip content after bubbled "blur" hence focusout */
			document.addEventListener("focusout", function(event) {
				if (!event.target.parentNode.hasAttribute('magic-edit')) return;
				if (!event.target.hasAttribute('contenteditable')) return;

				if (event.target.parentNode.hasAttribute('data-magic-key')) {
					if (event.target) event.target.innerHTML = '';
					return;
				}

				if (event.target.parentNode.getAttribute('magic-edit') == 'innerHTML') {
					var elms = event.target.querySelectorAll('[data-magic-key]');
					if (!elms.length) return;
					elms.forEach(function(elm) {
						elm.innerHTML = '';
					});
					return;
				}
			});

			/* monitor visibility of scene in Hype IDE - Thanks for the tip @jonathan */
			document.addEventListener("visibilitychange", function(event) {
				if (document.hidden) {
					if (_debug) console.log(_extensionName + ': Page hidden');
				} else {
					if (_debug) console.log(_extensionName + ': Page visible');
					refresh(_hypeDocumentIDE, document.documentElement);
				}
			}, false);

			/* initial setup with slight delay */
			setTimeout(function() {
				if (_debug) console.log(_extensionName + ': initial refresh');
				refresh(_hypeDocumentIDE, document.documentElement);
				if (_debug) console.log(_extensionName + ': changeObserver');
				createChangeObserver(_hypeDocumentIDE, document.documentElement);
				enableChangeObserver(_hypeDocumentIDE);
			}, 1);

			/* 
			This code inserts two CSS rules into the first stylesheet on the page. The first CSS rule is applied to all elements with the attribute [contenteditable="true"] that also have a descendant element with the attribute [data-magic-key]. This CSS rule makes all elements with those attributes have an opacity of 0.5.
			
			The second CSS rule is applied to all elements with the attribute [data-magic-key]:before. This CSS rule is used to style the pseudo-element that is generated by the [data-magic-key] attribute.
			
			The third rule  is applied to all elements with the attribute [data-magic-key]:after. This CSS rule is used to style a pseudo-element that is generated by the [data-magic-key] attribute and adds a 1px border around the element.
			*/

			// Define the base styles for highlightDataMagic
			var highlightDataMagicBase = _default['highlightDataMagic'] ? '[data-magic-key]::before' : '[magic-edit]::before';
			var highlightDataMagicStyles = 'position: absolute; content: attr(data-magic-key); z-index: 10; height: 16px; line-height:16px; padding: 3px 5px 3px 5px; top: -16px; left: 0px; text-align: center; font: 9px Arial; color: white; background: #75A4EA; border-top-right-radius: 0.2rem; border-top-left-radius: 0.2rem; box-sizing: border-box;';


			// Define all your CSS rules in an array
			var rules = [
				'[contenteditable="true"] [data-magic-key], [magic-edit="preview"] [contenteditable="true"]  {opacity:0.5}',
				highlightDataMagicBase + ' {' + highlightDataMagicStyles + '}'
			];

			// Conditionally add a rule based on _default['highlightDataMagic']
			if (_default['highlightDataMagic']) {
				rules.push('[data-magic-key]:after {content: " "; position: absolute; z-index: -1; top: 0px; left: 0px; right: 0px; bottom: 0px; border: 1px solid #75A4EA;}');
			}

			// Iterate over the rules array and insert each rule into the stylesheet
			rules.forEach((rule) => document.styleSheets[0].insertRule(rule, 0));

			window.getSelection().removeAllRanges();
		});
	}

	/**
	 * @typedef {Object} HypeDataMagic
	 * @property {String} version Version of the extension
	 * @property {Function} setData This function allows to set data by passing in an object. An optional data source name can also be used (name defaults to "shared")
	 * @property {Function} getData This function allows to get the data for a specific data source. If no data source name is supplied it defaults to "shared"
	 * @property {Function} refresh This function allows force a refresh on all Hype document from the window level. You can also pass in a specific hypeDocument object to limit the scope.
	 * @property {Function} refresh This function is the same as refresh, but debounced
	 * @property {Function} setDefault This function allows to set a default value (see function description)
	 * @property {Function} getDefault This function allows to get a default value
	 * @property {Function} addDataHandler This function allows to define your own data handler either as an object with functions or a single function
	 * @property {Function} resolveObjectByKey This low level function returns resolves an object based on a string key notation similar to actual code and returns the value or branch if successful. You can also use an array of strings as the key
	 * @property {Function} resolveKeyToArray This low level function returns an array resolved based on a string key notation similar to actual code. Given an array as key it works recursive while resolving the input
	 * @property {Function} resolveVariablesInString This low level function returns a string with all variables resolved. It can also be used to resolve variables in a string.
	 * @property {Function} resolveVariablesInObject This low level function returns an object with all variables resolved. It can also be used to resolve variables in an object.
	 * @property {Function} cloneObject This low level function returns a clone of an object.
	 * @property {Function} findAttribute This low level function returns the value of an attribute on an element or its parents. If the attribute value starts with a '+' then it is added to the value of the attribute on the parent.
	 * @property {Function} resolveVariables This function resolves variables in an object using resolveVariablesInString recursively and a variables lookup
	 * @property {Function} constructVariablesContext This function constructs a variables context for resolving variables in an object
	 * @property {Function} debounceByRequestFrame This helper function returns a debounced function.
	 */
	var HypeDataMagic = {
		version: '1.4.0',
		setData: setData,
		getData: getData,
		refresh: refreshFromWindowLevel,
		refreshDebounced: refreshFromWindowLevelDebounced,
		setDefault: setDefault,
		getDefault: getDefault,
		addDataHandler: addDataHandler,
		/* low level */
		resolveObjectByKey: resolveObjectByKey,
		resolveKeyToArray: resolveKeyToArray,
		resolveVariablesInString: resolveVariablesInString,
		resolveVariablesInObject: resolveVariablesInObject,
		cloneObject: cloneObject,
		findAttribute: findAttribute,
		/* new in 1.4.0 */
		resolveVariables: resolveVariables,
		constructVariablesContext: constructVariablesContext,
		/* helper */
		debounceByRequestFrame: debounceByRequestFrame,
	};

	/** 
	 * Reveal Public interface to window['HypeDataMagic']
	 * return {HypeDataMagic}
	 */
	return HypeDataMagic;

})();
