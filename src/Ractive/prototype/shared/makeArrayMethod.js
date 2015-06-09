import { isArray } from 'utils/is';
import { normalise } from 'shared/keypaths';
import runloop from 'global/runloop';
import getNewIndices from 'shared/getNewIndices';

var arrayProto = Array.prototype;

export default function ( methodName ) {
	return function ( keypath, ...args ) {
		var array, len, promise, result, context;

		const context = this.viewmodel.getContext( keypath );
		const array = context.get();

		if ( !isArray( array ) ) {
			throw new Error( `shuffle array method ${method} called on non-array at ${keypath.getKeypath()}` );
		}

		const newIndices = getNewIndices( array.length, methodName, args );
		const result = arrayProto[ methodName ].apply( array, args );

		promise = runloop.start( this, true ).then( () => result );

		if ( newIndices ) {
			context.shuffle( newIndices );
		} else {
			// TODO... not sure what happens with sort/reverse yet
			context.mark();
		}

		// result = context.shuffle( methodName, args );
		runloop.end();

		return promise;
	};
}
