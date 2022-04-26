/*!
Hype DataMagic 1.3.6
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
*       
*/
if("HypeDataMagic" in window === false) window['HypeDataMagic'] = (function () {

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
		fallbackImage: function(){
			return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
		},
		handler:'text',
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
		resourcesFolderNameForPreview: '',
	};
	
	/**
	 * Force redraw of an element
	 * @param {HTMLElement} element
	 */
	var forceRedraw = function(element){
		var disp = element.style.display;
		element.style.display = 'none';
		void 0!=element.offsetHeight;
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
			DataMagicPrepareForDisplay: function(hypeDocument, element, event){
				if (element.innerHTML != event.data && hasNoHypeElementsAsChild(element)) {
					if (_default['allowVariables']) {
						event.data = resolveVariablesInString(event.data, Object.assign( 
							{},
							_default['variables'] || hypeDocument.customData, 
							{ resourcesFolderName: hypeDocument.resourcesFolderURL()},
							element && _default['allowDatasets']? {dataset: resolveDatasetVariables(element)} : null,
						));
					}
					element.innerHTML = event.data;
				}
			},
			DataMagicUnload: function(hypeDocument, element, event){
				if (hasNoHypeElementsAsChild(element)) element.innerHTML = '';
			}
		},
		'variables': {
			DataMagicPrepareForDisplay: function (hypeDocument, element, event){
				if (_default['allowVariables']) event.data = resolveVariablesInString(event.data, _default['variables'] || hypeDocument.customData);
				return event;
			}
		},
		'dataset': {
			DataMagicPrepareForDisplay: function (hypeDocument, element, event){
				if (element && _default['allowDatasets']) event.data = resolveVariablesInObject(event.data, {dataset: resolveDatasetVariables(element)});
				return event;
			}
		},
		'image': {
			DataMagicPrepareForDisplay: function (hypeDocument, element, event){
				if (typeof event.data == 'string') event.data = {src: event.data};
				if (!event.data.src) event.data.src = element.dataset.fallbackImage || _default.fallbackImage();
				if (_default['allowVariables']) {
					event.data = resolveVariablesInObject(event.data, Object.assign( 
						{},
						_default['variables'] || hypeDocument.customData, 
						{ resourcesFolderName: hypeDocument.resourcesFolderURL()},
						element && _default['allowDatasets']? {dataset: resolveDatasetVariables(element)} : null,
					));
				}
				element.innerHTML = '';
				if (hypeDocument.getElementProperty(element, 'background-image')!=event.data.src) {
					element.style.backgroundRepeat = 'no-repeat';
					element.style.backgroundPosition = event.data.backgroundPosition || element.dataset.backgroundPosition || 'center center';
					element.style.backgroundSize = event.data.backgroundSize || element.dataset.backgroundSize || 'contain';
					hypeDocument.setElementProperty(element, 'background-image', event.data.src);
				}
			},
			DataMagicUnload: function(hypeDocument, element, event){
				hypeDocument.setElementProperty( element, 'background-image','');
				element.style.backgroundRepeat = element.style.backgroundPosition = element.style.backgroundRepeat = '';
			}
		}
	}

	/**
	 * Calls the handler function for the given event. This function is called by the event handler. It calls the handler function for the given event.
	 *
	 * @param {HYPE.documents.HYPEDocument} hypeDocument The document object.
	 * @param {HTMLElement} element The element that triggered the event.
	 * @param {Object} event The event object.
	 */
	function callHandler(hypeDocument, element, event){
		if (!event.handler) return;

		if (event.handler.slice(-2)=='()'){
			if (!_isHypeIDE && hypeDocument.functions){
				try {
					returnFromHandler = hypeDocument.functions()[event.handler.slice(0,-2)](hypeDocument, element, event);
				} catch (e){
					console.log('There was an error in your handler "'+event.handler+'": ',e);
				}
				return returnFromHandler;
			} else{
				return;
			}
		}

		var returnFromHandler;
		if (typeof _handler[event.handler] == 'object') {
			/* handle event if defined directly */
			if (typeof _handler[event.handler][event.type] == 'function') {
				try {
					returnFromHandler = _handler[event.handler][event.type](hypeDocument, element, event);
				} catch (e){
					console.log('There was an error in your handler "'+event.handler+'": ',e);
				}
				return returnFromHandler;
			}
			/* fallback on DataMagicPrepareForDisplay for IDE if DataMagicPreviewUpdate is not defined */
			if (_isHypeIDE && typeof _handler[event.handler]['DataMagicPrepareForDisplay'] == 'function'){
				try {
					returnFromHandler = _handler[event.handler]['DataMagicPrepareForDisplay'](hypeDocument, element, event);
				} catch (e){
					console.log('There was an error in your handler "'+event.handler+'": ',e);
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
	function updateMagicKey(hypeDocument, element, event){
		if (!element.getAttribute('data-magic-key')) return;

		// find the source we are working from and handle special source customData
		var keyParts = trim(element.getAttribute('data-magic-key')).split(':');
		var key =  keyParts[1] ?  keyParts[1] : keyParts[0];
		var inlineSourceName = keyParts[1] ? keyParts[0].trim() : null;
		var source = inlineSourceName || findMagicAttribute(element, 'data-magic-source') || _default['source'];
		
		var data = (source == 'customData')? hypeDocument.customData : getData(source);
		
		// is we have a source proceed
		if (data){
			// look if we have a brach an combine it with our key, only look if no inline source was used
			var branchkey = keyParts[1] ? '' : findMagicAttribute(element, 'data-magic-branch');
			var branch = branchkey? resolveObjectByKey(data, branchkey) : data;
			var branchdata = resolveObjectByKey(branch, key);
			
			if (branchdata!=null) {
				// check if we have a object as data source
				if (typeof (branchdata) != 'object' && typeof (branchdata) != 'function') {					
					var prefix = element.getAttribute('data-magic-prefix') || '';
					var append = element.getAttribute('data-magic-append') || '';
					if (prefix || append) {
						branchdata = prefix + branchdata + append;
					}
				}

				// construct our event object by creating a new one
				event = Object.assign({}, event, {
					'data': branchdata, 
					'source': source, 
					'key': key,
				});
				
				// define types of events to be fired
				var types;
				if (event.type){
					// reuse Hype events as our own by renaming
					types = event.type.replace('HypeScene', 'DataMagic').split();
				} else {
					// create event if not given (direct refresh etc.)
					types = _isHypeIDE? ['DataMagicPreviewUpdate']:['DataMagicPrepareForDisplay','DataMagicLoad'];
				}
				
				// extract handler string as array and loop over it
				var handlers = (element.getAttribute('data-magic-handler') ||  _default['handler']).split(',');
				
				// loop over types array
				types.forEach(function(type){
					// loop over handler array
					// allow returns from handlers to be mixed in to the next item in the call stack
					var returnFromHandler;
					handlers.forEach(function(handler){
						returnFromHandler = callHandler(hypeDocument, element, Object.assign(
							{}, event, returnFromHandler, {
								type: type, 
								handler: handler.trim()
							}
						));
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
	function unloadMagicKey(hypeDocument, element, event){
		// make sure we have an object
		event = Object.assign({}, event);

		// extract handler string as array
		handlers = (event.oldHandler || element.getAttribute('data-magic-handler')  ||  _default['handler']).split(',');

		// loop over handler array
		// allow returns from handlers to be mixed in to the next item in the call stack
		var returnFromHandler;
		handlers.forEach(function(handler){
			returnFromHandler = callHandler(hypeDocument, element, Object.assign(
				{}, event, returnFromHandler, {
					type: 'DataMagicUnload', 
					handler: handler.trim()
				}
			));
		})
	}

	/**
	 * This function checks if the element has no Hype elements as child.
	 *
	 * @param {HTMLElement} element - The element to check.
	 * @returns {boolean} - True if the element has no Hype elements as child, false otherwise.
	 */
	function hasNoHypeElementsAsChild(element){
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
	function createChangeObserver (hypeDocument, baseContainer){
		if (_observer[hypeDocument.documentId()]) return;

		_observer[hypeDocument.documentId()] = {

			changeObserver: new MutationObserver(function(mutations) {
				mutations.forEach(function (mutation) {
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
							unloadMagicKey(hypeDocument, element, {oldHandler: oldValue});
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

			enable: function(){
				this.changeObserver.observe(baseContainer, this.options);
			},

			disable: function(){
				this.changeObserver.disconnect();
			}
		}	
	}

	/**
	 * Enable the change observer for the specified Hype document.
	 *
	 * @param {HYPE_Document} hypeDocument - The Hype document.
	 */
	function enableChangeObserver(hypeDocument){
		if (!_observer[hypeDocument.documentId()]) return;
		_observer[hypeDocument.documentId()].enable();
	}

	/**
	 * Disable the change observer for the specified Hype document.
	 *
	 * @param {HYPE_Document} hypeDocument - The Hype document.
	 */
	function disableChangeObserver(hypeDocument){
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
	function refreshDescendants(hypeDocument, element, event){
		if (!element) return;
		var elms = element.querySelectorAll('[data-magic-key]');
		elms.forEach(function(elm){
			updateMagicKey(hypeDocument, elm, event);
			if ( _default['forceRedrawElement'] || (!_isHypeIDE && _default['forceRedrawElementNonIDE'])) forceRedraw(elm);
		});
	}

	/**
	 * Refresh the specified element.
	 *
	 * @param {HYPE_Document} hypeDocument - The Hype document.
	 * @param {HTMLElement} element - The element.
	 * @param {Event} event - The event.
	 */
	function refreshElement(hypeDocument, element, event){
		if (!element) return;
		updateMagicKey(hypeDocument, element, event);
		if ( _default['forceRedrawElement']==true || (!_isHypeIDE && _default['forceRedrawElementNonIDE'])) forceRedraw(element);
	}

	/**
	 * Refresh the specified element and its descendants.
	 *
	 * @param {HYPE_Document} hypeDocument - The Hype document.
	 * @param {HTMLElement} element - The element.
	 * @param {Event} event - The event.
	 */
	function refresh(hypeDocument, element, event){
		if (!element) return;
		refreshElement(hypeDocument, element, event);
		refreshDescendants(hypeDocument, element, event);
		if ( _default['forceRedrawDocument']==true  || (!_isHypeIDE && _default['forceRedrawDocumentNonIDE'])) forceRedraw(element);
	}
	
	/**
	 * Debounced version of above (internal usage)
	 */
	var refreshDebounced = debounceByRequestFrame(refresh);
			

	/**
	 * This function allows to set data
	 *
	 * @param {Object} data This parameter needs to be an object but it can hold nested values of any type. To use JSON data parse the data before you set it.
	 * @param {String} source The source is a optional name to store the data. It defaults to the string "shared".
	 */
	function setData(data, source){
		source = source || _default['source'];
		_data[source] = data;
		if ( _default['refreshOnSetData']==true) refreshFromWindowLevel();
	}

	/**
	 * This function allows to refesh the view from the window level using HypeDataMagic.refresh
	 *
	 * @param {Object} hypeDocument This parameter is optional and should be a hypeDocument object to refresh. If no paramter is provided it will refresh all documents found under window.HYPE.documents
	 */
	function refreshFromWindowLevel(hypeDocument){
		//refresh explicit document
		if (hypeDocument && hypeDocument.hasOwnProperty('refresh')){
			hypeDocument.refresh();
		
		//refresh all documents
		} else if (window.hasOwnProperty('HYPE')){
			Object.values(window.HYPE.documents).forEach(function(hypeDocument){
				hypeDocument.refresh();
			});
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
	function setDefault(key, value){
		_default[key] = value;
	}

	/**
	 * This function returns the value of set default
	 *
	 * @param {String} key This the key of the default.
	 * @return Returns the current value for a default with a certain key.
	 */
	function getDefault(key){
		return _default[key];
	}


	/**
	 * This function removes all the white spaces from the beginning and the end of the string
	 *
	 * @param {string} str - The string to be trimmed
	 * @returns {string} - The trimmed string
	 */
	function trim(str){
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
	function resolveKeyToArray(key){
		if(Array.isArray(key)) return key.reduce(function(a,b){
			return a.concat(resolveKeyToArray(b));
		},[]);
		if (typeof key != 'string') return;
		key = key.replace(/\[(\d+)\]/g, function(match, key){
			return '.'+parseInt(key);
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
		while (objValue!==undefined && i < keyParts.length) {
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
					var variableKey =  keyParts[1] ?  keyParts[1] : keyParts[0];
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
	 * This low level function traverses up the DOM tree to find and return a specific attribute. It aborts at the scene element (or window level depending where you start the search).
	 * This function is currently not exposed to the API, but still documented
	 *
	 * @param {String} element This the object the key should act on.
	 * @param {String} attr This is the name of the attribute to search for going up the dom tree.
	 * @return Returns the current value for a default with a certain key.
	 */
	function findMagicAttribute(element, attr) {
		if (!element || !element.id) return null;
		while (element.parentNode && !element.classList.contains('HYPE_scene')) {
			if (element.hasAttribute(attr)) {
				return element.getAttribute(attr);
			}
			element = element.parentNode;
		};
		return null;
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
	function addDataHandler(name, handler){
		if(!typeof name == 'string') return;
		switch (typeof handler){
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
	 * Helper to determine if an object is reactive by checking __isReactive.
	 *
	 * @param {Object} obj - The object to check.
	 * @returns {boolean} - True if the object is reactive, false otherwise.
	 */
	function isReactive(obj) {
		return obj.__isReactive;
	};
	
	/**
	 * This function makes an object reactive and fires a callback on set operations
	 *
	 * @param {Object} obj This the object that should be made reactive
	 * @param {Function} callback This is function that should be called
	 * @return Returns the object as a proxy
	 */
	function enableReactiveObject (obj, callback) {
		if (isReactive(obj)) return obj;
		
		const handler = {
			get(target, key, receiver) {
				const result = Reflect.get(target, key, receiver);
				if (typeof result === 'object') {
					return enableReactiveObject(result, callback);
				}
				return result;
			},
			set(target, key, value, receiver) {
				const result = Reflect.set(target, key, value, receiver);
				if(key !== '__isReactive') callback(key, value, target, receiver);
				return result;
			},
		};
		const proxy = new Proxy(obj, handler);
		Object.defineProperty(proxy, '__isReactive', {
			value: true,
			enumerable: false,
			configurable: false,
		});
		return proxy;
	}
	
	/**
	 * This function makes an object non-reactive
	 *
	 * @param {Object} obj This the object that should be made non-reactive
	 * @return Returns the object as a non-reactive object
	 */
	function disableReactiveObject(obj) {
		if (!isReactive(obj)) return obj;
	
		const result = {};
		for (const key in obj) {
			if (obj.hasOwnProperty(key)) {
				const value = obj[key];
				if (typeof value === 'object') {
					result[key] = disableReactiveObject(value);
				} else {
					if(key !== '__isReactive') result[key] = value;
				}
			}
		}
		return result;
	}
	
	
	
	/**
	 * This function creates another function that can be used to loop through a set of steps. 
	 * This could be useful, for example, in creating animations or a set of instructions that need to be followed in order.
	 *
	 * @param {Array} arr - The array of steps to be looped through
	 * @param {number} i - The index to start at
	 * @param {function} callback - The function to be called on each step
	 * @param {string} key - The key to use for the object
	 * @returns {function} - A function that can be used to loop through the steps
	 */
	function createSequence(arr, i, callback, key) {
		i = i || 0;
		const steps = [];
		arr.forEach(step => {
			if (Array.isArray(step)) {
				for (let j = 0; j < step[0]; j++) {
					steps.push(step[1]);
				}
			} else {
				steps.push(step);
			}
		});
		
		return function(n) {
			n = n == undefined? 0 : n;
			if (typeof n === "string") i = n = parseInt(n);
			
			if (i >= steps.length) i = i % steps.length;
			if (i < 0) i = steps.length + (i % steps.length);
			
			const step = steps[i];
			i += n;
			
			if (typeof step === "function") step = step();
		
			switch (typeof callback){
				case "function":
					callback(step);
					break;
	
				case "object":
					if (key) object[key] = step;
					break;
			} 
			return step;
		};
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
	function HypeDocumentLoad (hypeDocument, element, event) {
		
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
		hypeDocument.refresh = function(element){
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
		hypeDocument.refreshDescendants = function(element){
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
		hypeDocument.refreshElement = function(element){
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
		hypeDocument.disableChangeObserver = function(){
			disableChangeObserver(this);
		}

		/**
		 * This function allows to (re)enable observer based refresh calls when updating a data-magic-* attribute
		 *
		 */
		hypeDocument.enableChangeObserver = function(){
			enableChangeObserver(this);
		}

		/**
		 * This function is a simple helper function that checks if the content provided differs from the content found in element.innHTML and only refreshes if needed.
		 *
		 * @param {HTMLDivElement} element The element to check
		 * @param {string} content The content to set in innerHTML if it differs
		 */
		hypeDocument.setContentIfNecessary = function(element, content){
			if (element.innerHTML != content) {
				element.innerHTML = content;
			}
		}
		
		/**
		 * This function enables a refresh when customData is changed (debounce, beta)
		 *
		 */
		hypeDocument.enableReactiveCustomData = function(){
			hypeDocument.customData = enableReactiveObject(hypeDocument.customData, _default['reactiveCustomDataHandler'] || function(key, value){
				if (hypeDocument._refreshRequested) return;
				hypeDocument._refreshRequested = true;
				requestAnimationFrame(function() {
					hypeDocument._refreshRequested = false;
					hypeDocument.refresh();
				});
			});
		}
		
		
		/**
		 * This function disables reactive customData (beta)
		 *
		 */
		hypeDocument.disableReactiveCustomData = function(){
			hypeDocument.customData = disableReactiveObject(hypeDocument.customData);
		}
		
		/* 
		new since 1.3.5: if _default('customData') is set it is used 
		to init hypeDocument.customData
		*/
		if ( _default['customData']) {
			hypeDocument.customData = _default['customData'];
		}
		
		/*
		new since 1.3.6: if _default['makeCustomDataReactive'] is set it
		will trigger hypeDocument.refresh whenever custom data is updated
		*/
		if ( _default['refreshOnCustomData']) {
			hypeDocument.enableReactiveCustomData();
		}
		
		/*
		Create a change observer for the hypeDocument and element, and enables the change observer.
		*/
		if (!_isHypeIDE){
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
	function HypeScenePrepareForDisplay (hypeDocument, element, event) {
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
	function HypeSceneLoad (hypeDocument, element, event) {
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
	function HypeSceneUnload (hypeDocument, element, event) {
		disableChangeObserver(hypeDocument);
	}

	/* setup callbacks */
	if("HYPE_eventListeners" in window === false) { window.HYPE_eventListeners = Array();}
	window.HYPE_eventListeners.push({"type":"HypeDocumentLoad", "callback": HypeDocumentLoad});
	window.HYPE_eventListeners.push({"type":"HypeScenePrepareForDisplay", "callback": HypeScenePrepareForDisplay});
	window.HYPE_eventListeners.push({"type":"HypeSceneLoad", "callback": HypeSceneLoad});
	window.HYPE_eventListeners.push({"type":"HypeSceneUnload", "callback": HypeSceneUnload});
	
	/* run in IDE */
	if (_isHypeIDE){
		
		/*
		The above code sets up the HypeDocumentIDE variable to be used in the scene editor.
		This will allow the scene editor to use some of the functions (from the original hypeDocument)
		that are not available in the scene editor.
		
		One such function is the "resourcesFolderURL()" function. This is useful for accessing resources (images, videos, etc.) that
		are contained in a folder in the scene editor. It can also be used for accessing custom functions that are not available in the scene editor.
		*/
		_hypeDocumentIDE = new Proxy({ 
			getElementProperty: function(element, property){
				return element.style.getPropertyValue(property) || null;
			},
			setElementProperty: function(element, property, value){
				if (value) switch (property){
					case 'background-image':  value = 'url('+value+')'; break;
				}
				element.style.setProperty(property, value, 'important');
			},
			documentId: function(){
				return 'HypeSceneEditor';
			},
			resourcesFolderURL: function(){
				return _default['resourcesFolderNameForPreview'] || window.location.href.replace(/\/$/, '')
			},
		}, {
			get: function(obj, prop) {
				if (prop === 'customData') return _default['customDataForPreview'] ||  _default['customData'] || {};
				return obj[prop];
			},
		});

		/* 
		This code resets the entire document. It first unloads all handlers that have unload functions
		then reloads the entire document. The unload functions are called before the document is reloaded
		with its original handlers.
		*/
		var temp = _handler;
		_handler= {};
		for (var key in temp) {
			if (temp[key].DataMagicUnload) _handler[key] = { DataMagicPrepareForDisplay: temp[key].DataMagicUnload }
		}
		HypeDocumentLoad(_hypeDocumentIDE, document.documentElement);
		_handler = temp;
				
		/* fire fake document load event for IDE */
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
			mutations.forEach(function (mutation) {
				var element = mutation.target;
				if (mutation.type === 'attributes') {

					if (element.parentNode && mutation.attributeName == 'contenteditable'){
						
						/* handle edits on rectangles with user set data-magic-key in the identity HTML attributes */
						if(element.parentNode.hasAttribute('data-magic-key')){
							if(element.getAttribute('contenteditable') == 'false' && mutation.oldValue =='true'){
								if (_debug) console.log(_extensionName+': innerHTML rebuild (after edit)');
								/* refresh the preview after edit */
								setTimeout(function(){
									element.parentNode.removeAttribute('magic-edit');
									refreshElement(_hypeDocumentIDE, element.parentNode);
								}, 1);
								
							} else {
								if (_debug) console.log(_extensionName+': innerHTML purge (before edit)');
								/* add preview to innerHTML when double clicked */
								element.parentNode.setAttribute('magic-edit','preview');
								setTimeout(function(){
									var branch = findMagicAttribute(element.parentNode, 'data-magic-branch');
									var placeholder = '<!-- Hype Data magic: This is only a preview placeholder and edits are ignored!';
									if (branch) placeholder += ' This key resides on the branch "'+branch+'"';
									placeholder += ' -->';
									element.innerHTML = placeholder + "\n"+element.parentNode.getAttribute('data-magic-key');
								}, 1);
							}
							return;
						}

						/* handle edits on rectangles that contain data-magic-keys but are not handled by previous block */
						if (element.parentNode.querySelectorAll('[data-magic-key]').length) {
							if(element.getAttribute('contenteditable') == 'false' && mutation.oldValue =='true'){
								if (_debug) console.log(_extensionName+': innerHTML rebuild included magic keys (after edit)');
								/* refresh the preview after edit */
								setTimeout(function(){
									element.parentNode.removeAttribute('magic-edit');
									var elms = element.parentNode.querySelectorAll('[data-magic-key]');
									elms.forEach(function(elm){
										refreshElement(_hypeDocumentIDE, elm);
									});
								}, 1);

							} else {
								if (_debug) console.log(_extensionName+': innerHTML purge included magic keys (before edit)');
								element.parentNode.setAttribute('magic-edit','innerHTML');
								/* substitute keys with the key identifier while editing */
								setTimeout(function(){	
									var elms = element.parentNode.querySelectorAll('[data-magic-key]');
									elms.forEach(function(elm){
										elm.innerHTML = elm.getAttribute('data-magic-key');
									});
								}, 1);
							}
							return;
						}
					}
					
				} else{

					if (_debug) console.log(_extensionName+': unmapped mutation', mutation);
				}	
			});
		});

		refreshObserver.observe(document.documentElement, { 
			attributes: true,
			attributeOldValue: true,
			attributeFilter:['contenteditable'],
			subtree: true,
		});
		
		/*
		
		Here we are using a feature called MutationObserver. This feature allows us to detect changes that have been made to the DOM (HTML). The MutationObserver has a callback function (the function inside the parentheses) that is called whenever there is a change to the DOM. The callback has an argument called mutations.
		
		The mutations object contains all of the changes that have been made to the DOM. We can loop through the mutations object and check what kind of changes have been made. In our case, we're interested in two types of changes:
		
		1) Changes to the attributes of an element. For example, if we change the data-hype-id attribute of an element, we want to know about it.
		2) Changes to the innerHTML of the HypeMainContentDiv. This is how we know when the Hype has refreshed and changes the page.
		
		Once we've detected that a change has been made, we need to update the magic-edit attributes on all of the elements in the document. We do this by calling the refresh Debounced function (which we defined earlier). This function will loop through all of the elements in the document and update the magic-edit attributes.
		
		*/
		var observer = new MutationObserver(function(mutations) {
			if (refreshDebounced.timeout) return;
			var attrUpdate = false;
			var pageUpdate = mutations.length == 2 && mutations[0].target.id == 'HypeMainContentDiv';
			if (!pageUpdate) {
				var i = 0;
				while (i < mutations.length && !attrUpdate) {
					if (mutations[i].type === 'attributes' && mutations[i].attributeName.match(/^data\-/)) {
						attrUpdate = true;
					} else {
						i++;
					}
				}
			}
			if (attrUpdate || pageUpdate) {
				document.querySelectorAll('*[magic-edit]').forEach(function (el) {
					el.removeAttribute('magic-edit');
				});
				refreshDebounced(_hypeDocumentIDE, document.documentElement);
			}
		});
		
		observer.observe(document.documentElement, {
			characterData: false,
			attributes: true,
			childList: true,
			subtree: true
		});

		
		/* setup after dom has loaded first time */
		window.addEventListener("DOMContentLoaded", function(event) {
			if (_debug) console.log(_extensionName+': DOMContentLoaded');
			
			/* strip content after bubbled "blur" hence focusout */
			document.addEventListener("focusout", function(event) {
				if(!event.target.parentNode.hasAttribute('magic-edit')) return;
				if(!event.target.hasAttribute('contenteditable')) return;
				
				if(event.target.parentNode.hasAttribute('data-magic-key')){
					if(event.target) event.target.innerHTML = '';
					return;
				}
				
				if(event.target.parentNode.getAttribute('magic-edit') == 'innerHTML'){
					var elms = event.target.querySelectorAll('[data-magic-key]');
					if (!elms.length) return;
					elms.forEach(function(elm){
						elm.innerHTML = '';
					});
					return;
				}	
			});

			/* 
			This code inserts two CSS rules into the first stylesheet on the page. The first CSS rule is applied to all elements with the attribute [contenteditable="true"] that also have a descendant element with the attribute [data-magic-key]. This CSS rule makes all elements with those attributes have an opacity of 0.5.
			
			The second CSS rule is applied to all elements with the attribute [data-magic-key]:before. This CSS rule is used to style the pseudo-element that is generated by the [data-magic-key] attribute.
			
			The third rule  is applied to all elements with the attribute [data-magic-key]:after. This CSS rule is used to style a pseudo-element that is generated by the [data-magic-key] attribute and adds a 1px border around the element.
			*/
			var highlightDataMagic = _default['highlightDataMagic']? '[data-magic-key]::before' : '[magic-edit]::before';
			document.styleSheets[0].insertRule('[contenteditable="true"] [data-magic-key], [magic-edit="preview"] [contenteditable="true"]  {opacity:0.5}',0);
			
			document.styleSheets[0].insertRule(highlightDataMagic+' {position: absolute; content: "Data Magic";  z-index: 10; top: -16px; left: 0px; height: 15px; display: flex; align-items: center; justify-content: center; font: 8px Arial; color: white; background: #75A4EA; border-top-right-radius: 0.2rem; border-top-left-radius: 0.2rem; padding: 0.5rem; box-sizing: border-box;}',0);
			
			if (_default['highlightDataMagic']) document.styleSheets[0].insertRule('[data-magic-key]:after {content: " "; position: absolute; z-index: -1; top: 0px; left: 0px; right: 0px; bottom: 0px; border: 1px solid #75A4EA;}',0);

			window.getSelection().removeAllRanges();
		});
	}
	 
	 /**
	  * @typedef {Object} HypeDataMagic
	  * @property {String} version Version of the extension
	  * @property {Function} setData This function allows to set data by passing in an object. An optional data source name can also be used (name defaults to "shared")
	  * @property {Function} getData This function allows to get the data for a specific data source. If no data source name is supplied it defaults to "shared"
	  * @property {Function} refresh This function allows force a refresh on all Hype document from the window level. You can also pass in a specific hypeDocument object to limit the scope.
	  * @property {Function} setDefault This function allows to set a default value (see function description)
	  * @property {Function} getDefault This function allows to get a default value
	  * @property {Function} addDataHandler This function allows to define your own data handler either as an object with functions or a single function
	  * @property {Function} resolveObjectByKey This low level function returns resolves an object based on a string key notation similar to actual code and returns the value or branch if successful. You can also use an array of strings as the key
	  * @property {Function} resolveKeyToArray This low level function returns an array resolved based on a string key notation similar to actual code. Given an array as key it works recursive while resolving the input
	  * @property {Function} resolveVariablesInString This low level function returns a string with all variables resolved. It can also be used to resolve variables in a string.
	  * @property {Function} resolveVariablesInObject This low level function returns an object with all variables resolved. It can also be used to resolve variables in an object.
	  * @property {Function} cloneObject This low level function returns a clone of an object.
	  * @property {Function} enableReactiveObject This low level function enables reactive object.
	  * @property {Function} disableReactiveObject This low level function disables reactive object.
	  * @property {Function} createSequence This helper function factory creates a function that returns the next item from a sequence on each call.
	  * @property {Function} debounceByRequestFrame This helper function returns a debounced function.
	  */
	var HypeDataMagic = {
		version: '1.3.6',
		'setData': setData,
		'getData': getData,
		'refresh': refreshFromWindowLevel,
		'setDefault': setDefault,
		'getDefault': getDefault,
		'addDataHandler': addDataHandler,
		/* low level */
		'resolveObjectByKey': resolveObjectByKey,
		'resolveKeyToArray': resolveKeyToArray,
		'resolveVariablesInString': resolveVariablesInString,
		'resolveVariablesInObject': resolveVariablesInObject,
		'cloneObject': cloneObject,
		'enableReactiveObject': enableReactiveObject,
		'disableReactiveObject': disableReactiveObject,
		/* helper */
		createSequence: createSequence,
		debounceByRequestFrame: debounceByRequestFrame,
	};

	/** 
	 * Reveal Public interface to window['HypeDataMagic']
	 * return {HypeGlobalBehavior}
	 */
	return HypeDataMagic;
	
})();
