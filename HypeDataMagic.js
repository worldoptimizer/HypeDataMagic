/*!
Hype Data Decorator 1.2.7
copyright (c) 2019-2021 Max Ziebell, (https://maxziebell.de). MIT-license
*/

/*
* Version-History
* 1.0 Initial release under MIT-license
* 1.1 Added option to set initial value
* 1.2.0 Inspired by Symbol Override I added a callback
* 1.2.1 Also updating when class is modified (only in IDE)
* 1.2.2 Minor bugfix on preview, refactored names (breaking change)
* 1.2.3 Remove the possibility for recursive loops in IDE and console.log
* 1.2.4 Added hypeDocument, symbolInstance to callback and setContent
* 1.2.5 Renamed and refactored to Hype Data Decorator
* 1.2.6 Another refactor, comments in code, cleanup and direct observer
* 1.2.7 Minor update: Adding the hypeDocumentElm and sceneElm to event
*/
if("HypeDataDecorator" in window === false) window['HypeDataDecorator'] = (function () {

	var _mapList = [];
	var _activated = {};
	var _decorator = {
		'setContent' : function(hypeDocument, element, event) {
			setContent(element, event.value);
		}
	};

	/* @const */
	const _isHypeIDE = window.location.href.indexOf("/Hype/Scratch/HypeScratch.") != -1;

	// this branch only runs in IDE, set _isHypeIDE to false to remove it in closure compiler
	if (_isHypeIDE) {
		var _lastRefresh = 0;

		// trigger observerd attributes
		function refreshIDE (){
			// debounce as Hype likes to refresh multiple times
			var now = Math.round(new Date().getTime()/10); if (_lastRefresh == now) return; _lastRefresh = now;
			// loop over declared observer 
			_mapList.forEach(function(mapItem) {
				// check if this has a attributeName and if so search for it and set it to trigger handler
				if (mapItem.attributeName) document.querySelectorAll('['+mapItem.attributeName+']').forEach(function(elm){
					elm.setAttribute(mapItem.attributeName, elm.getAttribute(mapItem.attributeName));
				});
			});
		}

		// While in IDE wait for webkit to load the view
		window.addEventListener('DOMContentLoaded', function (event){
			// create a hypeDocumentElm for the webkit view (not HYPE_document but <html> itself)
			var hypeDocumentElm = document.documentElement || document.body;
			activateObserver(hypeDocumentElm);

			// add an reverse class observer triggering our custom refreshIDE above when classList is changed in IDE
			var classObserver = new MutationObserver(function(){ refreshIDE(); });
			classObserver.observe(hypeDocumentElm, { attributes: true, subtree: true, attributeFilter: [ 'class' ]});
			
		});
	}

	// this function runs through our activated observer and disconnects them given a hypeDocumentElm match
	// the match is used to only deactive observer that belong to the current Hype document
	function deactivateObserver(hypeDocumentElm){
		for (var key in _activated) {
			if (key.indexOf(hypeDocumentElm.id+'__') != -1) {
				// through observer in the garbage (collector)
				_activated[key].disconnect();
				_activated[key] = undefined;
				delete _activated[key];
			}
		}
	}

	// this function deactives running observer and then runs through our planned observer list and triggers
	// the associated activateHandler. We use this abstraction to have different kinds of observer activations.
	// baseCOntainer is dependent on the context we are launching in (IDE, Preview/Export) could be simplefied
	// by introducing a fake hypeDocument in IDE
	function activateObserver (hypeDocumentElm, hypeDocument){
		
		// deactivate any existing observer for this hypeDocumentElm (mainly for IDE)
		// could be gated with if (isHypeIDE) ... in current logic, leaving it in for now
		deactivateObserver(hypeDocumentElm);

		// run through our list of planned observer
		_mapList.forEach(function(mapItem){
			mapItem.activateHandler(mapItem, hypeDocumentElm, hypeDocument);
		});
	}

	function uniqueObserverId(hypeDocumentElm, addition){
		return hypeDocumentElm.id+'__'+addition;
	}

	// this is the orginial handler of Data Decorator and starts to observer a (data)attribute and maps
	// the (data)attribute to a className or selector
	function observerAttributeByName_BroadcastToSelectorWithCallback(mapItem, hypeDocumentElm, hypeDocument) {
		// unique key for this type of observer setup: attributeName observerd
		var unique = uniqueObserverId(hypeDocumentElm, mapItem.attributeName);
		
		// Fake sceneElm as hypeDocumentElm
		var sceneElm = hypeDocumentElm;		
		
		// only redeclare and start if not running
		if (!_activated[unique]){
			mapItem.observerFunction = function(mutations) {
				mutations.forEach(function(mutation) {
					if (mutation.attributeName == mapItem.attributeName) {
						// get current attribute name from watched data(attribute)
						var currentValue = mutation.target.getAttribute(mapItem.attributeName);

						// fetch all decendants matching the mapped selector
						var targetElms = [].slice.call(mutation.target.querySelectorAll(mapItem.selector));
						
						// check if the mutation target triggering this matches too and add it
						if(mutation.target.matches(mapItem.selector)) targetElms.unshift(mutation.target);
						
						for (var i=0; i < targetElms.length; i++) {
							// resolve if we have a symbolInstance when running not in IDE
							var symbolInstance = hypeDocument? hypeDocument.getSymbolInstanceById(targetElms[i].id):null;

							// make sure we cast to an unified array of functions and establish fallback to setContent
							var callbacks = castAsCallbackArray(mapItem.callback? mapItem.callback : setContent);

							// set sceneElm if we are not in the IDE before applying callbacks
							if (!_isHypeIDE) sceneElm = document.getElementById(hypeDocument.currentSceneId());

							// run through array and execute function callbacks, pass on value if possible
							var value;
							for(var j=0; j<callbacks.length; j++){
								var value = callbacks[j](hypeDocument, targetElms[i], value || {
									'value' : currentValue, 
									'mutation': mutation,
									'symbolInstance' : symbolInstance,
									'hypeDocumentElm' : hypeDocumentElm,
									'sceneElm' : sceneElm,
								});
							}
						}
					}
					// setup setter logic with -inital value because Hype resets on scene change, not always desired
					if (mutation.attributeName == mapItem.attributeName+'-initial') {
						var initialValue = mutation.target.getAttribute(mapItem.attributeName+'-initial');
						var currentValue = mutation.target.getAttribute(mapItem.attributeName);
						if (_isHypeIDE){
							mutation.target.setAttribute(mapItem.attributeName, initialValue);
						} else {
							if (currentValue!=null ) {
								mutation.target.setAttribute(mapItem.attributeName, currentValue);
							} else if (!mutation.target.hasAttribute(mapItem.attributeName) && initialValue) {
								mutation.target.setAttribute(mapItem.attributeName, initialValue);
							}
						}
					}
				});
			}
			
			// create an observer based on the obserFunction just created
			mapItem.observer = new MutationObserver( mapItem.observerFunction );

			// remeber activated observer
			_activated[unique] = mapItem.observer;
			
			// define a startFunction for the observer
			mapItem.startObserver = function(target){
				 this.observer.observe(target, { 
					attributes: true, attributeOldValue: true, subtree: true,
					attributeFilter: [ this.attributeName, this.attributeName+'-initial' ]
				});
			};
			
			// start observing hypeDocumentElm
			mapItem.startObserver(hypeDocumentElm);
		}
	}


	// this is the new handler of Data Decorator to observer a single node and handle its
	// changes by passing them to (a) callback(s)
	function observeNodeBySelector_HandleWithCallback(mapItem, hypeDocumentElm, hypeDocument) {
		
		// unique key for this type of observer setup: attributeName observerd
		var unique = uniqueObserverId(hypeDocumentElm, mapItem.selector);
		var attributeName = mapItem.attributeFilter? mapItem.attributeFilter[0] : 'style';

		// Fake sceneElm as hypeDocumentElm
		var sceneElm = hypeDocumentElm;
		 
		// only redeclare and start if not running
		if (!_activated[unique]){
			mapItem.observerFunction = function(mutations) {
				mutations.forEach(function(mutation) {
					// gate against unmatching calls
					if(!mutation.target.matches(mapItem.selector)) return;

					// get current attribute name from watched data(attribute)
					var currentValue = mutation.target.getAttribute(attributeName);

					// resolve if we have a symbolInstance when running not in IDE
					var symbolInstance = hypeDocument? hypeDocument.getSymbolInstanceById(mutation.target) : null;

					// make sure we cast to an unified array of functions and establish fallback to setContent
					var callbacks = castAsCallbackArray(mapItem.callback);

					// set sceneElm if we are not in the IDE before applying callbacks
					if (!_isHypeIDE) sceneElm = document.getElementById(hypeDocument.currentSceneId());

					// run through array and execute function callbacks, pass on value if possible
					var value;
					for(var j=0; j<callbacks.length; j++){
						var value = callbacks[j](hypeDocument, mutation.target, value || {
							'value' : currentValue,
							'mutation': mutation,
							'symbolInstance' : symbolInstance,
							'hypeDocumentElm' : hypeDocumentElm,
							'sceneElm' : sceneElm,
						});
					}
				});
			}
			
			// create an observer based on the obserFunction just created
			mapItem.observer = new MutationObserver( mapItem.observerFunction );

			// remeber activated observer
			_activated[unique] = mapItem.observer;
			
			//determine attributes to observe
			var attributeFilter = mapItem.attributeFilter? mapItem.attributeFilter : ['style'];

			// start document observer with subtree (perfomance should suffer because we gate)
			mapItem.observer.observe(hypeDocumentElm, { 
				attributes: true, attributeOldValue: true, subtree:true,
				attributeFilter: attributeFilter,
			});
		}
	}

	function castAsCallbackArray(callback){
		var callbacks = [];
		switch (typeof callback){
			case 'function':
				callbacks= [callback];
				break;

			case 'string':
				callbacks = callback.split('|')
				.map(function(a){ return a.trim()})
				.filter(function(a){return a && _decorator[a];})
				.map(function(a){ return _decorator[a]});
				break;

			case 'object':
				if (Array.isArray(callback)){
					callbacks = callback
					.filter(function(a){return typeof a == 'function' || _decorator[a];})
					.map(function(a){return typeof a == 'function'? a : _decorator[a];});
				}
				break;
		}
		return callbacks;
	}



	function HypeDocumentLoad (hypeDocument, element, event) {
		var hypeDocumentElm = hypeDocument.getElementById(hypeDocument.documentId());
		activateObserver(hypeDocumentElm, hypeDocument);
	}

	function validKey(key){
		return new RegExp(/^[a-z0-9-_]+$/i).test(key);
	}

	/* functions also used in public interface */

	// default callback sets innerHTML if we don't have any HYPE child nodes
	// this helps in preventing undesired destruction of Hype managed nodes
	// this is also set as default decorator and registers as a callback
	
	/**
	 * This function allows to set innerHTML in a save way. Meaning it
	 * helps in preventing undesired destruction of Hype managed nodes
	 * this is also set as the default decorator and registers as a callback 
	 *
	 * @param {HTMLDivElement} element This is the element to set the content on
	 * @param {String} value The value determins what is inserted to innerHTML
	 */
	function setContent(element, value){
		if (!element) return;
		if (element.querySelector('.HYPE_element_container, .HYPE_element')) return;
		element.innerHTML = value;
	}

	/**
	 * This function is a proxy to HypeDataDecorator.mapAttributeToSelector and
	 * and sets the attribute data-YOURKEY and maps it to the class .YOURKEY
	 * serving as a shortcut. The callback is optional and has setContent as fallback.
	 * The value of the data-YOURKEY will be forwarded to the callback(s) as event.value
	 *
	 * @param {String} key This is the data attribute we want to map
	 * @param {String} callback This is an decorator callback and is optional
	 * @param {Object} options These options are a mixin and still not used here
	 */
	function mapDataAttribute (key, callback, options){
		mapAttributeToSelector('data-'+key, '.'+key, callback || _decorator[key] || setContent, options);
	}
	
	/**
	 * This function maps a attribute to selector and fires the given callback
	 * on all its decendants. This function allows for more flexebility in mapping.
	 * and the callback is optional and has setContent as fallback.
	 * The value of the attribute will be forwarded to the callback(s) as event.value
	 *
	 * @param {String} key This is the attribute we want to map
	 * @param {String} selector This is the selector we want to forward the value to
	 * @param {String} callback This is an decorator callback and is optional
	 * @param {Object} options These options are a mixin and still not used here
	 */
	function mapAttributeToSelector (key, selector, callback, options){
		if (!validKey(key) || !selector || !callback) return;
		options = options? options : {};
		_mapList.push( Object.assign(options, {
			attributeName : key,
			selector : selector,
			callback : callback,
			// handler
			activateHandler : observerAttributeByName_BroadcastToSelectorWithCallback
		}));
	}

	/**
	 * This function allow to register a element decorator callback by name.
	 * Having named callbacks allows to chain them and reuse them if wanted.
	 *
	 * @param {String} name This is the attribute we want to map
	 * @param {Function} callback This is the function to be registered as an decorator
	 */
	function registerElementDecorator (name, callback){
		_decorator[name] = callback; 
	}

	/**
	 * This function maps sets up an HTML element observer that match a selector and a attribute.
	 * By default the style attribute on the HTML element is observered for change.
	 * To determine other attributes use the options as {attributesFilter: ['a','b']}.
	 * If one needs to listen to all attributes set options as {attributesFilter: []}
	 * 
	 * @param {String} selector This is the selector that determin
	 * @param {String} callback This is an decorator callback and is optional
	 * @param {Object} options These options are a mixin and allow setting the attributeFilter
	 */
	function observeBySelector(selector, callback, options){
		if (!selector || !callback) return;
		options = options? options : {};
		_mapList.push( Object.assign(options, {
			selector : selector,
			callback : callback,
			// handler
			activateHandler : observeNodeBySelector_HandleWithCallback
		}));	
	}

	/**
	 * This function returns a list of all running observer. Mainly for testing.
	 *
	 * @return Return array with active observer across all Hype documents
	 */
	function getRunningObserver(){
		return _activated;
	}

	/* setup callbacks */
	if("HYPE_eventListeners" in window === false) { window.HYPE_eventListeners = Array();}
	window.HYPE_eventListeners.push({"type":"HypeDocumentLoad", "callback": HypeDocumentLoad});
	
	/* Reveal Public interface to window['HypeDataDecorator'] */
	return {
		version: '1.2.7',
		'mapDataAttribute' : mapDataAttribute,
		'mapAttributeToSelector' : mapAttributeToSelector,
		'observeBySelector' : observeBySelector,
		'registerElementDecorator' : registerElementDecorator,
		'setContent' : setContent,
		'getRunningObserver': getRunningObserver,
	};
})();
