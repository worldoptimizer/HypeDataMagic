/*!
Hype DataMagic (Core) 1.3.2
copyright (c) 2021 Max Ziebell, (https://maxziebell.de). MIT-license
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
	
	// defaults can be overriden with setDefault
	var _default = {
		source: 'shared',		
		fallbackImage: function(){
			return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
		},
		handlerMixin: {},
		sourceRedirect: {},
		customDataForPreview: {},
	};
	
	var _handler = {
		'text': {
			DataMagicPrepareForDisplay: function(hypeDocument, element, event){
				if (element.innerHTML != event.data && hasNoHypeElementsAsChild(element)) element.innerHTML = event.data;
			},
			DataMagicUnload: function(hypeDocument, element, event){
				if (hasNoHypeElementsAsChild(element)) element.innerHTML = '';
			}
		},
		'image': {
			DataMagicPrepareForDisplay: function (hypeDocument, element, event){
				if (typeof event.data == 'string') event.data = {src: event.data};
				if (!event.data.src) event.data.src = element.dataset.fallbackImage || _default.fallbackImage();
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

	function callHandler(hypeDocument, element, event){
		if (!event.handler) return;

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

	function updateMagicKey(hypeDocument, element, event){
		if (!element.getAttribute('data-magic-key')) return;

		// find the source we are working from and handle special source customData
		var source = findMagicAttribute(element, 'data-magic-source') || _default['source'];
		var key = trim(element.getAttribute('data-magic-key'));
		var data = (source == 'customData')? hypeDocument.customData : getData(source);
		
		// is we have a source proceed
		if (data){
			// look if we have a brach an combine it with our key
			var branchkey = findMagicAttribute(element, 'data-magic-branch');
			var branch = branchkey? resolveObjectByKey(hypeDocument, data, branchkey) : data;
			var branchdata = resolveObjectByKey(hypeDocument, branch, key);
			
			if (branchdata!=null) {
				// check if we have a object as data source
				if (typeof branchdata != 'object') {					
					var prefix = element.getAttribute('data-magic-prefix');
					var append = element.getAttribute('data-magic-append');
					if (prefix || append) branchdata = prefix + branchdata + append;
					
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
				var handlers = (element.getAttribute('data-magic-handler') || 'text').split(',');
				
				// loop over types array
				types.forEach(function(type){
					// loop over handler array
					// allow returns from handlers to be mixed in to the next item in the call stack
					var returnFromHandler;
					handlers.forEach(function(handler){
						returnFromHandler = callHandler(hypeDocument, element, Object.assign(
							{}, event, returnFromHandler, {
								type: type, 
								'handler': handler.trim()
							}
						));
					})
				})
				
			} else {
				unloadMagicKey(hypeDocument, element);
			}
		}
	}

	function unloadMagicKey(hypeDocument, element, event){
		// make sure we have an object
		event = Object.assign({}, event);

		// extract handler string as array
		handlers = (event.oldHandler || element.getAttribute('data-magic-handler')  || 'text').split(',');

		// loop over handler array
		// allow returns from handlers to be mixed in to the next item in the call stack
		var returnFromHandler;
		handlers.forEach(function(handler){
			returnFromHandler = callHandler(hypeDocument, element, Object.assign(
				{}, event, returnFromHandler, {
					type: 'DataMagicUnload', 
					'handler': handler.trim()
				}
			));
		})
	}

	function hasNoHypeElementsAsChild(element){
		return !element.querySelectorAll('.HYPE_element, .HYPE_element_container').length;
	}

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

	function enableChangeObserver(hypeDocument){
		if (!_observer[hypeDocument.documentId()]) return;
		_observer[hypeDocument.documentId()].enable();
	}

	function disableChangeObserver(hypeDocument){
		if (!_observer[hypeDocument.documentId()]) return;
		_observer[hypeDocument.documentId()].disable();
	}

	function refreshDescendants(hypeDocument, element, event){
		if (!element) return;
		var elms = element.querySelectorAll('[data-magic-key]');
		elms.forEach(function(elm){
			updateMagicKey(hypeDocument, elm, event);
		});
	}

	function refreshElement(hypeDocument, element, event){
		if (!element) return;
		updateMagicKey(hypeDocument, element, event);
	}

	function refresh(hypeDocument, element, event){
		if (!element) return;
		refreshElement(hypeDocument, element, event);
		refreshDescendants(hypeDocument, element, event)
	}

	/**
	 * This function allows to set data
	 *
	 * @param {Object} data This parameter needs to be an object but it can hold nested values of any type. To use JSON data parse the data before you set it.
	 * @param {String} source The source is a optional name to store the data. It defaults to the string "shared".
	 */
	function setData(data, source){
		source = source || _default['source'];
		_data[source] = data;
	}

	/**
	 * This function allows to get data
	 *
	 * @param {String} source This the name of the data you want to access. It defaults to the string "shared".
	 * @return Returns the object Hype Data Magic currently has stored under the given source name.
	 */
	function getData(source){
		if (_default['sourceRedirect'][source]) return _data[_default['sourceRedirect'][source]] || null;
		if (source) return _data[source] || null;
		return _data[_default['source']] || null;
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

	function trim(str){
		if (typeof str != 'string') return;
		return str.trim();
	}

	function resolveObjectByKey(hypeDocument, obj, key) {
		if (typeof obj!='object') return;
		if (typeof key != 'string') return;
		key = key.replace(/\[(\d+)\]/g, function(match, key){
			return '.'+parseInt(key);
		});
		key = key.replace(/^\./, '');
		var parts = key.split('.');
		for (var i = 0, n = parts.length; i < n; ++i) {
			if (typeof obj!='object') return;
			key = parts[i];
			if (!obj.hasOwnProperty(key)) return;
			obj = obj[key];
		}
		return obj;
	}

	function findMagicAttribute(element, attr) {
		if (!element || !element.id) return null;
		while (element.parentNode && !element.classList.contains('HYPE_scene')) {
			if (element.hasAttribute(attr)) {
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

	function HypeDocumentLoad (hypeDocument, element, event) {
		
		/**
		 * This function allows to refresh the data in the current scene
		 *
		 * @param {HTMLDivElement} element The element (including descendants) to refresh. This defaults to the scene element.
		 */
		hypeDocument.refresh = function(element){
			refresh(this, element || document.getElementById(this.currentSceneId()));
		}

		/**
		 * This function allows to refresh the data of all descendant of a given element
		 *
		 * @param {HTMLDivElement} element The element to start the descendants refresh. This defaults to the scene element.
		 */
		hypeDocument.refreshDescendants = function(element){
			refreshDescendants(this, element || document.getElementById(this.currentSceneId()));
		}

		/**
		 * This function allows to refresh a specific element
		 *
		 * @param {HTMLDivElement} element The element to refresh.
		 */
		hypeDocument.refreshElement = function(element){
			refreshElement(this, element);
		}

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
		 * This function is a simple helper function that checks if the content provided differs from the content found in element.innHTML and only refreshes if needed
		 *
		 * @param {HTMLDivElement} content The content to set in innerHTML if it differs
		 */
		hypeDocument.setContentIfNecessary = function(element, content){
			if (element.innerHTML != content) {
				element.innerHTML = content;
			}
		}

		if (!_isHypeIDE){
			createChangeObserver(hypeDocument, element);
			enableChangeObserver(hypeDocument);
		}
	}

	function HypeScenePrepareForDisplay (hypeDocument, element, event) {
		disableChangeObserver(hypeDocument);
		refresh(hypeDocument, element, event);
	}

	function HypeSceneLoad (hypeDocument, element, event) {
		refresh(hypeDocument, element, event);
		enableChangeObserver(hypeDocument);
	}
	
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

		/* setup fake hypeDocument for IDE */
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
		}, {
			get: function(obj, prop) {
				if (prop === 'customData') return _default['customDataForPreview'];
				return obj[prop];
			},
		});

		/* fire fake document load event for IDE */
		if (_debug) console.log(_extensionName+': HypeDocumentLoad (extending _hypeDocumentIDE)');
		HypeDocumentLoad(_hypeDocumentIDE, document.documentElement);

		/* setup listener for edits on element content(dblClick)/innerHTML(pen) using data magic */
		var refreshObserver = new MutationObserver(function(mutations) {
			mutations.forEach(function (mutation) {
				var element = mutation.target;
				if (mutation.type === 'attributes') {

					if (element.parentNode && mutation.attributeName == 'contenteditable'){
						
						/* handle edits on rectangles with user set data-magic-key in the identity HTML attributes*/
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

		/* handle updates in page like duplication and copy & paste */
		var _debounceInterval;
		var childListObserver = new MutationObserver(function(mutations) {
			if (_debounceInterval) return;
			if (mutations.length!=2) return;
			if (mutations[0].target.id != 'HypeMainContentDiv') return;
			_debounceInterval = setTimeout(function(){
				if (_debug) console.log(_extensionName+': child list change (copy & paste or duplication)');
				_debounceInterval = null;
				refresh(_hypeDocumentIDE, document.documentElement);
			},1);
		})

		childListObserver.observe(document.documentElement, { 
			childList: true,
			subtree: true,
		});

		/* handle updates on page while in same scene */
		_updates = {};
		var updateObserver = new MutationObserver(function(mutations) {
			mutations.forEach(function (mutation) {
				var currentValue =  mutation.target.getAttribute(mutation.attributeName);
				if (currentValue && mutation.oldValue == currentValue && currentValue.indexOf('data-magic')!=-1){
					var id = mutation.target.getAttribute('hypeobjectid');
					if (_updates[id]) return;
					_updates[id] = setTimeout(function(){
						if (_debug) console.log(_extensionName+': rebuild after Hype refresh', mutation.target.id);
						refreshElement(_hypeDocumentIDE, mutation.target);
						delete(_updates[id]);
					},1);
				}
			});
		})

		updateObserver.observe(document.documentElement, { 
			attributes: true,
			attributeOldValue: true,
			attributeFilter:['hypeattributelastkeysplist'],
			subtree: true,
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

			/* monitor visibility of scene in Hype IDE - Thanks for the tip @jonathan */
			document.addEventListener("visibilitychange", function(event) {
				if (document.hidden) {
					if (_debug) console.log(_extensionName+': Page hidden');
				} else  {
					if (_debug) console.log(_extensionName+': Page visible');
					refresh(_hypeDocumentIDE, document.documentElement);
				}
			}, false);

			/* initial setup with slight delay */
			setTimeout(function(){
				if (_debug) console.log(_extensionName+': initial refresh');
				refresh(_hypeDocumentIDE, document.documentElement);
				if (_debug) console.log(_extensionName+': changeObserver');
				createChangeObserver(_hypeDocumentIDE, document.documentElement);
				enableChangeObserver(_hypeDocumentIDE);
			},1);

			/* dynamic styles for IDE preview and deselect */
			document.styleSheets[0].insertRule('[contenteditable="true"] [data-magic-key], [magic-edit="preview"] [contenteditable="true"]  {opacity:0.5}',0);
			document.styleSheets[0].insertRule('[magic-edit]::before { position:absolute; opacity:1; content: "Data Magic"; text-align: center; font-size:7px; padding:3px; height: 8px; width: 40px; color:#fff; left: -2px; top: -16px; border-radius: 1px; background-color: #75A4EA;}',0);
			window.getSelection().removeAllRanges();
		});
	}


	/**
	 * @typedef {Object} HypeDataMagic
	 * @property {String} version Version of the extension
	 * @property {Function} setData This function allows to set data by passing in an object. An optional data source name can also be used (name defaults to "shared")
	 * @property {Function} getData This function allows to get the data for a specific data source. If no data source name is supplied it defaults to "shared"
	 * @property {Function} setDefault This function allows to set a default value (see function description)
	 * @property {Function} getDefault This function allows to get a default value
	 * @property {Function} addDataHandler This function allows to define your own data handler either as an object with functions or a single function
	 */
	var HypeDataMagic = {
		version: '1.3.2',
		'setData': setData,
		'getData': getData,
		'setDefault': setDefault,
		'getDefault': getDefault,
		'addDataHandler': addDataHandler,
	};

	/** 
	 * Reveal Public interface to window['HypeDataMagic']
	 * return {HypeGlobalBehavior}
	 */
	return HypeDataMagic;
	
})();
