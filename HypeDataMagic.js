/*!
Hype DataMagic (Core) 1.0
copyright (c) 2020 Max Ziebell, (https://maxziebell.de). MIT-license
*/

/*
* Version-History
* 1.0 Initial release under MIT-license

*/
if("HypeDataMagic" in window === false) window['HypeDataMagic'] = (function () {

	/* @const */
  	const _debug = false;
  	/* @const */
	const _isHypeIDE = window.location.href.indexOf("/Hype/Scratch/HypeScratch.") != -1;
	
	/* @const */
	var _extensionName = 'Hype Data Magic';
	var _data = {};
	var _lookup = {};
	var _observer = {};
	var _onSceneLoad = [];
	var _hypeDocumentIDE;
	
	var _default = {
		source: 'shared',		
		fallbackImage: function(){
			return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
		},
		fetchResponseCallback: function(response){
			return response.json();
		},
		fetchErrorCallback: function(err, source){
			_debug && console.log(extensionName+': error while fetching data for '+source, err);
		},
		fetchDataCallback: function(data, source){
			_debug && console.log(extensionName+': fetched data for '+source, data);
		},
		handlerMixin: {},
		sourceRedirect: {},
		customDataForPreview: {},
		behaviorPrefix: '',
	};
	
	var _handler = {
		'text': {
			DataMagicPrepareForDisplay: function(hypeDocument, element, event){
				if (element.innerHTML != event.data) element.innerHTML = event.data;
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
		if (typeof _handler[event.handler] == 'object') {
			if (typeof _handler[event.handler][event.type] == 'function') {
				try {
					_handler[event.handler][event.type](hypeDocument, element, event);
				} catch (e){
					console.log('There was an error in your handler "'+event.handler+'": ',e);
				}
				return;
			}
			if (_isHypeIDE && typeof _handler[event.handler]['DataMagicPrepareForDisplay'] == 'function'){
				// DataMagicPreviewUpdate
				try {
					_handler[event.handler]['DataMagicPrepareForDisplay'](hypeDocument, element, event);
				} catch (e){
					console.log('There was an error in your handler "'+event.handler+'": ',e);
				}
				return;
			}
		}
	}

	function updateMagicKey(hypeDocument, element, event){
		if (!element.getAttribute('data-magic-key')) return;

		var source = findMagicAttributeAndCache(element, 'data-magic-source') || _default['source'];
		var key = trim(element.getAttribute('data-magic-key'));
		var data = (source == 'customData')? hypeDocument.customData : getData(source);
		
		if (data){
			var branch = resolveObjectByKey(hypeDocument, data, findMagicAttributeAndCache(element, 'data-magic-branch'));
			var branchdata = resolveObjectByKey(hypeDocument, branch || data, key);
			
			if (branchdata) {
				
				if (typeof branchdata != 'object') {
					var prefix = element.getAttribute('data-magic-prefix') || '';
					var append = element.getAttribute('data-magic-append') || '';
					branchdata = prefix + branchdata + append;
				}

				event = Object.assign(event||{}, {
					'data': branchdata, 
					'source': source, 
					'key': key,
					'handler': element.getAttribute('data-magic-handler') || branchdata.handler || 'text'
				});
				
				var types;
				if (event.type){
					types = event.type.replace('HypeScene', 'DataMagic').split();
				} else {
					types = _isHypeIDE? ['DataMagicPreviewUpdate']:['DataMagicPrepareForDisplay','DataMagicLoad'];
				}
				
				types.forEach(function(type){
					callHandler(hypeDocument, element, Object.assign(event, {type:type}));
				})
				
			} else {
				unloadMagicKey(hypeDocument, element);
			}
		}
	}

	function unloadMagicKey(hypeDocument, element, event){
		event = event || {};
		if (!event.type) event.type = 'DataMagicUnload';
		event.handler = event.oldHandler || element.getAttribute('data-magic-handler') || 'text';
		callHandler(hypeDocument, element, event)
	}

	function hasNoHypeElementsAsChild(element){
		return !element.querySelectorAll('.HYPE_element, .HYPE_element_container').length;
	}

	function markAsRecentlyRebuilt(element){
		element.setAttribute('magic-rebuild-time', Math.floor(performance.now()));
	}

	function recentlyRebuild(element){
		var lastRebuildTime = element.getAttribute("magic-rebuild-time");
		if(lastRebuildTime) return 100>performance.now()-parseInt(lastRebuildTime);
		return false;
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
					if (_isHypeIDE && recentlyRebuild(element)) return;

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
					}
				});
			}),

			options: {
				subtree: true,
				attributes: true,
				attributeFilter: ['data-magic-key', 'data-magic-source', 'data-magic-branch', 'data-magic-handler'],
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
	 * @return Returns the result of the event. Mostly this is an Boolean in case of Hype as it uses the events in an Observer pattern.
	 */
	function setData(data, source){
		source = source || _default['source'];
		_data[source] = data;
	}

	function triggerBehaviorOnHypeDocuments(behavior, refresh){
		if (!(window.HYPE && window.HYPE.documents)) return; 
		for(var documentName in window.HYPE.documents ) {
			var hypeDocument = window.HYPE.documents[documentName];
			hypeDocument.triggerCustomBehaviorNamed(_default['behaviorPrefix']+behavior);
			if (refresh) hypeDocument.refresh();
		}		
	}

	/**
	 * This function allows to get data
	 *
	 * @param {String} source Th is the name of the data you want to access. It defaults to the string "shared".
	 * @return Returns the object Hype Data Magic currently has stored under the given source name.
	 */
	
	function getData(source){
		if (_default['sourceRedirect'][source]) return _data[_default['sourceRedirect'][source]] || null;
		if (source) return _data[source] || null;
		return _data[_default['source']] || null;
	}

	function setDefault(key, value){
		_default[key] = value;
	}

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
		var parts = key.split('.'), seg;
		for (var i = 0, n = parts.length; i < n; ++i) {
			if (typeof obj!='object') return;
			key = parts[i];
			if (!obj.hasOwnProperty(key)) return;
			obj = obj[key];
		}
		return obj;
	}

	function findMagicAttributeAndCache(element, attr) {
		if (!element || !element.id) return null;
		var id = element.id;
		if (!_lookup[id]) _lookup[id] = {};
		if (_lookup[id][attr] && _lookup[id][attr].hasAttribute(attr)) {
			return _lookup[id][attr].getAttribute(attr);
		}
		while (element.parentNode && !element.classList.contains('HYPE_scene')) {
			if (element.hasAttribute(attr)) {
				_lookup[id][attr] = element;
				return element.getAttribute(attr);
			}
			element = element.parentNode;
		};
		delete _lookup[id][attr];
		return null;
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
		if (_onSceneLoad){
			_onSceneLoad.forEach(function(fnc){
				fnc();
			});
			_onSceneLoad = null;
		}
		for(var source in _data){
			triggerBehaviorOnHypeDocuments('has '+source+' data', true);
		}
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

		if (_debug) console.log(_extensionName+': HypeDocumentLoad (extending _hypeDocumentIDE)');
		HypeDocumentLoad(_hypeDocumentIDE, document.documentElement);

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
									markAsRecentlyRebuilt(element.parentNode);
									refreshElement(_hypeDocumentIDE, element.parentNode);
								}, 1);
								
							} else {
								if (_debug) console.log(_extensionName+': innerHTML purge (before edit)');
								/* add preview to innerHTML when double clicked */
								element.parentNode.setAttribute('magic-edit','preview');
								setTimeout(function(){
									var branch = findMagicAttributeAndCache(element.parentNode, 'data-magic-branch');
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
										markAsRecentlyRebuilt(elm);
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
										elm.removeAttribute('magic-rebuild-time');
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

	/* Reveal Public interface to window['HypeDataMagic'] */
	return {
		version: '1.0',
		'setData': setData,
		'getData': getData,
		
		'setDefault': setDefault,
		'getDefault': getDefault,
		
		'addDataHandler': addDataHandler,
	};
})();
