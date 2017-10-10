/* gen_abstraction.js
 *
 * This object serves as an asbtraction between the codegen for Gen and
 * the use of genish.js. In gibberwocky, Gen code is sent to Live/Max for
 * modulation purposes while genish.js is used to create waveforms that can
 * be sampled for pattern generation.
 *
 * This abstraction delays interpretation of the Gen(ish) graphs until 
 * one of the following two events occurs:
 *
 * 1. The graph is assigned to a property. This means that the graph
 * should be interpreted as a Gen graph.
 *
 * 2. The graph is used to create a WavePattern. This means that the
 * graph should be interpreted as a genish graph.
 *
 * One open problem: what if the same graph is used in two places? Can
 * the abstraction hold both types of codegen objects inside of it?
 */

const genish = require( 'genish.js' )
const genreq = require( './gen.js' )

/*  
assignInputProperties( genishGraph, abstractGraph ) {
  for( let input in abstractGraph.inputs ) {
    if( typeof abstractGraph.inputs[ input ] === 'number' ) {
      let __param = genishGraph.inputs[ input ] = genish.param( abstractGraph.inputs[ input ] )
      abstractGraph[ input ] = v => {
        __param.value = v
      }
    }
  }
},
*/

const defineMethod = function( obj, methodName, param, priority=0 ) {
  obj[ methodName ] = v => {
    if( v === undefined ) return param.value
    
    // else, set the value
    param.value = v
  }

  
  if( !obj.sequences ) obj.sequences = {}

  obj[ methodName ].seq = function( values, timings, id=0, delay=0 ) {
    if( obj.sequences[ methodName ] === undefined ) obj.sequences[ methodName ] = []

    if( obj.sequences[ methodName ][ id ] !== undefined ) obj.sequences[ methodName ][ id ].clear()

    const seq = Gibber.Seq( values, timings, methodName, obj, priority )
    obj.sequences[ methodName ][ id ] = seq 

    seq.__tick = seq.tick
    seq.tick = function( ...args ) {
      param.value = 0 
      for( let i = 0; i < obj.patterns.length; i++ ) {
        let pattern = obj.patterns[ i ]
        let graph   = obj.graphs[ i ]
        pattern.adjust( graph, Gibber.Scheduler.currentTimeInMs - pattern.phase )  
      }
      seq.__tick.apply( seq, args )
    }

    seq.trackID = obj.id

    if( id === 0 ) {
      obj[ methodName ].values  = obj.sequences[ methodName ][ 0 ].values
      obj[ methodName ].timings = obj.sequences[ methodName ][ 0 ].timings
    }

    obj[ methodName ][ id ] = seq

    seq.delay( delay )
    seq.start()

    // avoid this for gibber objects that don't communicate with Live such as Scale
    if( obj.id !== undefined ) Gibber.Communication.send( `select_track ${obj.id}` )

    return seq
  }
    
  obj[ methodName ].seq.delay = v => obj[ methodName ][ lastId ].delay( v )

  obj[ methodName ].seq.stop = function() {
    obj.sequences[ methodName ][ 0 ].stop()
    return obj
  }

  obj[ methodName ].seq.start = function() {
    obj.sequences[ methodName ][ 0 ].start()
    return obj
  }
}

module.exports = function( Gibber ) {
  const gen = genreq( Gibber )
  const genfunctions = {}

  gen.export( genfunctions )

  const __ugenproto__ = {
    render( mode ) {
      let inputs = [], inputNum = 0

      if( this.name === 'phasor' ) {
        if( this.inputs[2] === undefined ) {
          this.inputs[2] = { min:0 }
        }
      }

      for( let input of this.inputs ) {
        // use input.render as check to make sure this isn't a properties dictionary
        if( typeof input === 'object' && input.render !== undefined ) {
          inputs.push( input.render( mode ) )
        }else{
          if( mode === 'genish' && typeof input === 'number' ) { // replace numbers with params
            let _input =  genish.param( input )
            defineMethod( this, inputNum, _input )

            inputs.push( _input )
          }else{
            inputs.push( input )
          }
        }

        inputNum++
      }
      
      const ugen = mode === 'genish' ? genish[ this.name ]( ...inputs ) : genfunctions[ this.name ]( ...inputs )

      if( typeof this.__onrender === 'function' ) { this.__onrender() }

      return ugen
    },

    isGen:true
  }


  const __gen = {
    gen,
    genish,
    Gibber,
    ugenNames: [
      'cycle','phasor','accum','counter',
      'add','mul','div','sub',
      'sah','noise',
      'beats', 'lfo', 'fade', 'sine', 'siner', 'cos', 'cosr', 'liner', 'line',
      'abs', 'ceil', 'round', 'floor',
      'min','max',
      'gt','lt','ltp','gtp','samplerate','rate'
    ],

    ugens:{},

    init() {
      for( let name of this.ugenNames ) {
        this.ugens[ name ] = function( ...inputs ) {
          const ugen = Object.create( __ugenproto__ )

          ugen.name = name
          ugen.inputs = inputs

          return ugen
        }
      }

      this.ugens[ 'beats' ] = ( num ) => {
        const frequency = Gibber.Utility.beatsToFrequency( num, 120 )

        const ugen = this.ugens[ 'phasor' ]( frequency, 0, { min:0, max:1 } )
        const storedAssignmentFunction = ugen[0]

        ugen[0] = v => {
          if( v === undefined ) {
            return storedAssignmentFunction()
          }else{
            const freq = Gibber.Utility.beatsToFrequency( v )
            storedAssignmentFunction( freq )
          }
        }

        Gibber.addSequencingToMethod( ugen, '0' )

        return ugen
      }

      this.ugens[ 'sine' ] = ( beats=4, center=0, amp=7 ) => {
        const freq = btof( beats, 120 )
        const __cycle = this.ugens.cycle( freq )

        const sine = __cycle 
        const ugen = this.ugens.add( center, this.ugens.mul( sine, amp ) )

        ugen.__onrender = ()=> {

          ugen[0] = v => {
            if( v === undefined ) {
              return beats
            }else{
              beats = v
              __cycle[0]( btof( beats, 120 ) )
            }
          }

          Gibber.addSequencingToMethod( ugen, '0' )
        }

        return ugen
      }

      this.ugens[ 'siner' ] = ( beats=4, center=0, amp=7 ) => {
        const freq = btof( beats, 120 )
        const __cycle = this.ugens.cycle( freq )

        const sine = __cycle 
        const ugen = this.ugens.round( this.ugens.add( center, this.ugens.mul( sine, amp ) ) )
        
        ugen.sine = sine

        ugen.__onrender = ()=> {

          ugen[0] = v => {
            if( v === undefined ) {
              return beats
            }else{
              beats = v
              __cycle[0]( btof( beats, 120 ) )
            }
          }

          Gibber.addSequencingToMethod( ugen, '0' )
        }

        return ugen
      }

      this.ugens[ 'cos' ] = ( beats=4, center=0, amp=7 ) => {
        const freq = btof( beats, 120 )
        const __cycle = this.ugens.cycle( freq, 0, { initialValue:1 })

        const sine = __cycle 
        const ugen = this.ugens.add( center, this.ugens.mul( sine, amp ) )

        ugen[0] = v => {
          if( v === undefined ) {
            return beats
          }else{
            beats = v
            __cycle[0]( btof( beats, 120 ) )
          }
        }

        Gibber.addSequencingToMethod( ugen, '0' )

        return ugen
      }
      this.ugens[ 'cosr' ] = ( beats=4, center=0, amp=7 ) => {
        const freq = btof( beats, 120 )
        const __cycle = this.ugens.cycle( freq, 0, { initialValue:1 })

        const sine = __cycle 
        const ugen = this.ugens.round( this.ugens.add( center, this.ugens.mul( sine, amp ) ) )

        ugen[0] = v => {
          if( v === undefined ) {
            return beats
          }else{
            beats = v
            __cycle[0]( btof( beats, 120 ) )
          }
        }

        Gibber.addSequencingToMethod( ugen, '0' )

        return ugen
      }
      this.ugens[ 'liner' ] = ( beats=4, min=0, max=7 ) => {
        const line = this.ugens.beats( beats )

        const ugen = this.ugens.round( this.ugens.add( min, this.ugens.mul( line, max-min ) ) )

        ugen[0] = v => {
          if( v === undefined ) {
            return beats
          }else{
            beats = v
            line[0]( v )
          }
        }

        Gibber.addSequencingToMethod( ugen, '0' )

        return ugen
      }
      this.ugens[ 'line' ] = ( beats=4, min=0, max=1 ) => {
        const line = this.ugens.beats( beats )

        const ugen = this.ugens.add( min, this.ugens.mul( line, max-min ) )

        ugen[0] = v => {
          if( v === undefined ) {
            return beats
          }else{
            beats = v
            line[0]( v )
          }
        }

        Gibber.addSequencingToMethod( ugen, '0' )

        return ugen
      }
    },

    export( target ) {
      Object.assign( target, this.ugens )
    },
  }

  return __gen
}