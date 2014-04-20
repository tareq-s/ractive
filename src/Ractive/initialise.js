define([
	'config/isClient',
	'config/errors',
	'config/initOptions',
	'config/registries',
	'utils/warn',
	'utils/create',
	'utils/extend',
	'utils/fillGaps',
	'utils/defineProperties',
	'utils/getElement',
	'utils/isObject',
	'utils/isArray',
	'utils/getGuid',
	'utils/Promise',
	'shared/get/magicAdaptor',
	'parse/_parse',
	'Ractive/initialise/computations/createComputations'
], function (
	isClient,
	errors,
	initOptions,
	registries,
	warn,
	create,
	extend,
	fillGaps,
	defineProperties,
	getElement,
	isObject,
	isArray,
	getGuid,
	Promise,
	magicAdaptor,
	parse,
	createComputations
) {

	'use strict';

	var flags = [ 'adapt', 'modifyArrays', 'magic', 'twoway', 'lazy', 'debug', 'isolated' ];
	
	return function initialiseRactiveInstance ( ractive, options ) {

		var defaults = ractive.constructor.defaults;

		//allow empty constructor options
		options = options || {};

		initialiseOptionsAndFlags( ractive, defaults, options );

		//sets ._initing = true
		initialiseProperties( ractive, options ); 
		
		initialiseRegistries( ractive, defaults, options );

		initialiseComputedProperties( ractive, defaults, options );
		
		initialiseTemplates( ractive, defaults, options );
		
		renderInstance( ractive, options );

		// end init sequence
		ractive._initing = false;
	};

	function initialiseOptionsAndFlags( ractive, defaults, options ) {

		deprecate( defaults );
		deprecate( options );

		initOptions.keys.forEach( function ( key ) {
			if ( options[ key ] === undefined ) {
				options[ key ] = defaults[ key ];
			}
		});

		// flag options
		flags.forEach( function ( flag ) {
			ractive[ flag ] = options[ flag ];
		});

		// special cases
		if ( typeof ractive.adapt === 'string' ) {
			ractive.adapt = [ ractive.adapt ];
		}

		validate( ractive, options );
	}

	function deprecate(options){

		if ( isArray( options.adaptors ) ) {
			warn( 'The `adaptors` option, to indicate which adaptors should be used with a given Ractive instance, has been deprecated in favour of `adapt`. See [TODO] for more information' );
			options.adapt = options.adaptors;
			delete options.adaptors;
		}

		if ( options.eventDefinitions ) {
			// TODO remove support
			warn( 'ractive.eventDefinitions has been deprecated in favour of ractive.events. Support will be removed in future versions' );
			options.events = options.eventDefinitions;
		}

	}

	function validate( ractive, options ) {

		if ( ractive.magic && !magicAdaptor ) {
			throw new Error( 'Getters and setters (magic mode) are not supported in this browser' );
		}

		if ( options.el ) {
			ractive.el = getElement( options.el );
			if ( !ractive.el && ractive.debug ) {
				throw new Error( 'Could not find container element' );
			}
		}
	}

	function initialiseProperties( ractive, options ) {

		// We use Object.defineProperties (where possible) as these should be read-only
		defineProperties( ractive, {
			_initing: { value: true, writable: true },

			// Generate a unique identifier, for places where you'd use a weak map if it
			// existed
			_guid: { value: getGuid() },

			// events
			_subs: { value: create( null ), configurable: true },

			// cache
			_cache: { value: {} }, // we need to be able to use hasOwnProperty, so can't inherit from null
			_cacheMap: { value: create( null ) },

			// dependency graph
			_deps: { value: [] },
			_depsMap: { value: create( null ) },

			_patternObservers: { value: [] },

			// Keep a list of used evaluators, so we don't duplicate them
			_evaluators: { value: create( null ) },

			// Computed properties
			_computations: { value: create( null ) },

			// two-way bindings
			_twowayBindings: { value: {} },

			// animations (so we can stop any in progress at teardown)
			_animations: { value: [] },

			// nodes registry
			nodes: { value: {} },

			// property wrappers
			_wrapped: { value: create( null ) },

			// live queries
			_liveQueries: { value: [] },
			_liveComponentQueries: { value: [] },

			// components to init at the end of a mutation
			_childInitQueue: { value: [] },

			// data changes
			_changes: { value: [] },

			// failed lookups, when we try to access data from ancestor scopes
			_unresolvedImplicitDependencies: { value: [] }
		});

		// If this is a component, store a reference to the parent
		if ( options._parent && options._component ) {
			defineProperties( ractive, {
				_parent: { value: options._parent },
				component: { value: options._component }
			});

			// And store a reference to the instance on the component
			options._component.instance = ractive;
		}

	}

	function initialiseRegistries( ractive, defaults, options ) {
		
		//data goes first as it is primary argument to other function-based registry options
		var data = initialiseRegistry('data')
		if ( !ractive.data ) { ractive.data = {}; }
		
		registries
			.filter( function ( registry ) { return registry!=='data'; } )
			.forEach( initialiseRegistry );

		function initialiseRegistry( registry ) {

			var optionsValue = options[ registry ],
				defaultValue = ractive.constructor[ registry ] || defaults[ registry ],
				firstArg = registry==='data' ? optionsValue : ractive.data;

			if( typeof optionsValue === 'function' ) {
				ractive[ registry ] = optionsValue( firstArg, options )
			}
			else if ( defaultValue ) {
				ractive[ registry ] = ( typeof defaultValue === 'function' )
					? defaultValue( firstArg, options ) || optionsValue
					: extend( create( defaultValue ), optionsValue );
			}
			else if ( optionsValue ) {
				ractive[ registry ] = optionsValue;
			}	
		}
	}

	function initialiseTemplates( ractive, defaults, options ) {
		var template, templateEl, parsedTemplate;

		//instance options is a function, execute it
		if( typeof options.template === 'function' ) {
			template = options.template( options.data, options );
		}
		//if default has a function, execute it
		else if( defaults.template && typeof defaults.template === 'function' ) {
			template = defaults.template( options.data, options ) || options.template;
		} 
		//plain old template
		else {
			template = options.template;
		}

		// Parse template, if necessary
		if ( typeof template === 'string' ) {
			if ( !parse ) {
				throw new Error( errors.missingParser );
			}

			if ( template.charAt( 0 ) === '#' && isClient ) {
				// assume this is an ID of a <script type='text/ractive'> tag
				templateEl = document.getElementById( template.substring( 1 ) );
				if ( templateEl ) {
					parsedTemplate = parse( templateEl.innerHTML, options );
				}

				else {
					throw new Error( 'Could not find template element (' + template + ')' );
				}
			}

			else {
				parsedTemplate = parse( template, options );
			}
		} else {
			parsedTemplate = template;
		}

		// deal with compound template
		if ( isObject( parsedTemplate ) ) {
			fillGaps( ractive.partials, parsedTemplate.partials );
			parsedTemplate = parsedTemplate.main;
		}

		// If the template was an array with a single string member, that means
		// we can use innerHTML - we just need to unpack it
		if ( parsedTemplate && ( parsedTemplate.length === 1 ) && ( typeof parsedTemplate[0] === 'string' ) ) {
			parsedTemplate = parsedTemplate[0];
		}

		ractive.template = parsedTemplate;

		// Add partials to our registry
		extend( ractive.partials, options.partials );

		ractive.parseOptions = {
			preserveWhitespace: options.preserveWhitespace,
			sanitize: options.sanitize,
			stripComments: options.stripComments
		};
	}

	function initialiseComputedProperties( ractive, defaults, options ) {
		var computed;
		computed = defaults.computed
			? extend( create( defaults.computed ), options.computed )
			: options.computed;

		if ( computed ) {
			createComputations( ractive, computed );
		}
	}

	function renderInstance( ractive, options ) {
		var promise, fulfilPromise;

		// Temporarily disable transitions, if noIntro flag is set
		ractive.transitionsEnabled = ( options.noIntro ? false : options.transitionsEnabled );

		// If we're in a browser, and no element has been specified, create
		// a document fragment to use instead
		if ( isClient && !ractive.el ) {
			ractive.el = document.createDocumentFragment();
		}

		// If the target contains content, and `append` is falsy, clear it
		else if ( ractive.el && !options.append ) {
			ractive.el.innerHTML = '';
		}

		promise = new Promise( function ( fulfil ) { fulfilPromise = fulfil; });

		ractive.render( ractive.el, fulfilPromise );

		if ( options.complete ) {
			promise.then( options.complete.bind( ractive ) );
		}

		// reset transitionsEnabled
		ractive.transitionsEnabled = options.transitionsEnabled;
	}

});


