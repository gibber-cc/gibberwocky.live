const genish = require( 'genish.js' )

module.exports = function( Gibber ) {
  
'use strict'

const WavePattern = {
  __type: 'wavepattern',

  create( abstractGraph, values ) {

    // might change due to proxy functionality, so use 'let'
    let graph = abstractGraph.render( 'genish' ) // convert abstraction to genish.js graph

    const patternOutputFnc = function() {
      pattern.run()

      let signalValue = pattern.signalOut()
      // edge case... because adjust might lead to a value of 1
      // which accum would wrap AFTER the obtaining the current value
      // leading to an undefined value for the pattern output (e.g. pattern[ pattern.length ] )
      if( signalValue === 1 ) signalValue = 0

      let outputBeforeFilters = signalValue

      // if there is an array of values to read from... (signal is a phasor indexing into a values array)
      if( pattern.__usesValues === true ) {
        const scaledSignalValue = signalValue * ( pattern._values.length )
        const adjustedSignalValue = scaledSignalValue < 0 ? pattern._values.length + scaledSignalValue : scaledSignalValue
        const roundedSignalValue  = Math.floor( adjustedSignalValue )
        outputBeforeFilters = pattern._values[ roundedSignalValue ]
      }

      let output = outputBeforeFilters

      if( pattern.update && pattern.update.value ) pattern.update.value.unshift( output )

      if( output === pattern.DNR ) output = null

      return output
    }

    patternOutputFnc.wavePattern = true

    const pattern = Gibber.Pattern( patternOutputFnc )

    // check whether or not to use raw signal values
    // or index into values array
    pattern.__usesValues = values !== undefined

    abstractGraph.pattern = pattern
    abstractGraph.graph = graph
    if( abstractGraph.__listeners === undefined ) {
      abstractGraph.__listeners = []
    }

    const proxyFunction = ( oldAbstractGraph, newAbstractGraph ) => {
      graph = newAbstractGraph.render( 'genish' )
      newAbstractGraph.pattern = pattern
      newAbstractGraph.graph = graph
      pattern.graph = graph
      pattern.signalOut = genish.gen.createCallback( graph, mem, false, false, Float64Array ),
      pattern.phase = 0
      pattern.initialized = false

      if( newAbstractGraph.__listeners === undefined ) {
        newAbstractGraph.__listeners = []
      }
      newAbstractGraph.__listeners.push( proxyFunction ) 
    }

    abstractGraph.__listeners.push( proxyFunction )

    //WavePattern.assignInputProperties( graph, abstractGraph )

    // if memory block has not been defined, create new one by passing in an undefined value
    // else reuse exisitng memory block
    let mem = genish.gen.memory || 44100

    Object.assign( pattern, {
      graph,
      _values:values,
      signalOut: genish.gen.createCallback( graph, mem, false, false, Float64Array ), 
      adjust: WavePattern.adjust.bind( pattern ),
      phase:0,
      run: WavePattern.run.bind( pattern ),
      initialized:false,
      __listeners:[]
    })

    return pattern
  },

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

  run( ) {
    const now = Gibber.Scheduler.currentTimeInMs 

    if( this.initialized === true ) {
      const adjustment =  now - this.phase 
      this.adjust( this.graph, adjustment )
    }else{
      this.initialized = true
    }

    this.phase = now
    //debugger;
  },

  adjust( ugen, ms ) {
    // subtract one sample for the phase incremenet that occurs during
    // the genish.js callback
    const numberOfSamplesToAdvance = ( ms/1000 ) * (Gibber.__gen.genish.gen.samplerate  )


    if( ugen.name !== undefined && ( ugen.name.indexOf( 'accum' ) > -1 || ugen.name.indexOf( 'phasor' ) > -1 ) )  {
      if( ugen.name.indexOf( 'accum' ) > -1 ) {
        ugen.value += typeof ugen.inputs[0] === 'object' 
          ? numberOfSamplesToAdvance  * ugen.inputs[0].value 
          : numberOfSamplesToAdvance * ugen.inputs[0]

      }else{
        const range = ugen.max - ugen.min
        let __ugen = ugen

        while( __ugen.inputs !== undefined ) {
          __ugen = __ugen.inputs[0]
        }

        // needs .value because the result should be a param
        const freq = __ugen.value
        const incr = (freq * range ) / Gibber.__gen.genish.gen.samplerate
        const adjustAmount = (numberOfSamplesToAdvance-1)  * incr 
 
        ugen.value += adjustAmount
      }

      // wrap or clamp accum value manuallly
      if( ugen.shouldWrap === true ) {
        if( ugen.value > ugen.max ) {
          while( ugen.value > ugen.max ) {
            ugen.value -= ugen.max - ugen.min
          }
        } else if( ugen.value < ugen.min ) {
          while( ugen.value < ugen.min ) {
            ugen.value += ugen.max - ugen.min
          }
        } 
      }else if( ugen.shouldClamp === true ) {
        if( ugen.value > ugen.max ) { 
          ugen.value = max
        }else if( ugen.value < ugen.min ) {
          ugen.value = min
        }
      }
    }

    if( typeof ugen.inputs !== 'undefined' ) {
      ugen.inputs.forEach( u => WavePattern.adjust( u,ms ) ) 
    }
  }
 
}

return WavePattern.create

}

